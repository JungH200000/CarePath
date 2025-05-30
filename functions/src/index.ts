import * as functions from "firebase-functions/v1";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import * as turf from "@turf/turf";
import {Position, LineString, Polygon, MultiPolygon, Feature} from "geojson";

// Admin SDK 초기화
admin.initializeApp();

// 타입 정의: points 데이터의 개별 레코드 타입
type PointRecord = { // Firebase의 유동적 데이터 구조를 고려하여 any 허용
  latitude?: number;
  longitude?: number;
  timestamp?: number;
  // 다른 필드가 있을 수 있으므로 인덱스 시그니처 추가 (선택적)
  [key: string]: any;
};

/**
 * Realtime Database 트리거 함수
 * 경로 등록 완료 시 완충 지대 Polygon을 계산하고 저장합니다.
 */
export const calculateRouteBuffer = functions.database
  .ref("/registered_routes/{routeId}/metadata/finished_at")
  .onWrite(async (change, context) => {
    const routeId = context.params.routeId;

    // 데이터 변경 없거나 삭제 시 종료
    if (!change.after.exists() || change.before.val() === change.after.val()) {
      logger.log(`No buffer calculation needed for route ${routeId}.`);
      return null;
    }

    logger.log(`Calculating buffer for route: ${routeId}`);

    // DB 참조 설정
    const routeRef = admin.database().ref(`/registered_routes/${routeId}`);
    const pointsRef = routeRef.child("points");
    const metadataRef = routeRef.child("metadata");
    const bufferPolygonRef = routeRef.child("buffer_polygon");
    const bufferStatusRef = metadataRef.child("buffer_status");

    try {
      // 1. 경로 포인트 데이터 가져오기
      const pointsSnapshot = await pointsRef.once("value");
      if (!pointsSnapshot.exists()) {
        logger.warn(
          `No points found for route ${routeId}. Cannot calculate buffer.`
        );
        return null;
      }

      // points 데이터가 객체 형태임을 가정
      const pointsData = pointsSnapshot.val() as Record<string, PointRecord>;
      // 좌표 추출 및 정렬/변환 로직
      const coordinates: Position[] = Object.values(pointsData)
        // 유효한 좌표 필터링 (타입 가드 사용)
        .filter((p): p is PointRecord =>
          p && typeof p.latitude === "number" && typeof p.longitude === "number"
        )
        // timestamp 기준으로 정렬
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
        // Position 타입 ([lng, lat])으로 변환 (Non-null 단언 사용)
        .map((p): Position => [p.longitude as number, p.latitude as number]);

      // 포인트가 2개 미만이면 LineString 생성 불가
      if (coordinates.length < 2) {
        logger.warn(
          `Route ${routeId} has less than 2 valid points. ` +
          "Cannot create LineString."
        );
        return null;
      }

      // 2. 완충 지대 거리 가져오기
      const metadataSnapshot = await metadataRef.once("value");
      // 메타데이터 없으면 기본값 3미터 사용
      const bufferDistance = metadataSnapshot.child("buffer_meters").val() || 9;
      const units: turf.Units = "meters"; // 단위 명시

      // 3. Turf.js로 완충 지대 계산
      const lineFeature = turf.lineString(coordinates);
      const lineGeometry: LineString | null = lineFeature.geometry;
      // lineString 생성 실패 시 처리
      if (!lineGeometry) {
        logger.error(`Failed to create LineString for route ${routeId}`);
        return null;
      }

      // simplify 적용 (선택적)
      const simplifiedLine = turf.simplify(lineGeometry, {
        tolerance: 0.00001, // 약 1m 허용 오차
        highQuality: true,
      });

      // buffer 계산 (null 또는 undefined 반환 가능)
      const bufferFeature: Feature<Polygon | MultiPolygon> | undefined =
        turf.buffer(simplifiedLine, bufferDistance, {units: units});

      // buffer 결과 및 geometry 유효성 검사
      if (!bufferFeature?.geometry) {
        logger.error(
          `Buffer calculation failed for route ${routeId}. ` +
          "Geometry is null or undefined."
        );
        await bufferStatusRef.set("error_calculation"); // 에러 상태 저장
        return null;
      }

      let exteriorRing: Position[] | null = null;

      // geometry 타입 체크 및 좌표 추출
      if (bufferFeature.geometry.type === "Polygon") {
        const polygonGeometry = bufferFeature.geometry; // 타입 좁혀짐
        // 좌표 데이터 존재 및 외부 링 확인
        if (polygonGeometry.coordinates &&
            polygonGeometry.coordinates.length > 0) {
          exteriorRing = polygonGeometry.coordinates[0];
        }
      } else if (bufferFeature.geometry.type === "MultiPolygon") {
        const multiPolygonGeometry = bufferFeature.geometry; // 타입 좁혀짐
        logger.warn(
          `Buffer resulted in MultiPolygon for route ${routeId}. ` +
          "Using the exterior ring of the first polygon."
        );
        // 첫 번째 Polygon의 외부 링 좌표 확인
        if (
          multiPolygonGeometry.coordinates &&
          multiPolygonGeometry.coordinates.length > 0 &&
          multiPolygonGeometry.coordinates[0].length > 0
        ) {
          exteriorRing = multiPolygonGeometry.coordinates[0][0];
        }
      }

      // 4. Polygon 좌표 저장
      if (exteriorRing && exteriorRing.length > 0) {
        // react-native-maps 형식으로 변환
        const polygonCoordsForMap = exteriorRing.map((coord: Position) => ({
          longitude: coord[0],
          latitude: coord[1],
        }));
        // DB에 저장
        await bufferPolygonRef.set(polygonCoordsForMap);
        await bufferStatusRef.set("complete_" + Date.now()); // 완료 및 타임스탬프
        logger.log(`Buffer polygon saved and status updated ${routeId}.`);
      } else {
        logger.error(
          "Buffer calculation resulted in invalid coordinates " +
          `for route ${routeId}.`
        );
        await bufferStatusRef.set("error_coordinates"); // 에러 상태 저장
      }
      return null;
    } catch (error) {
      logger.error(`Error calculating buffer for route ${routeId}:`, error);
      try {
        await bufferStatusRef.set("error_exception");
      } catch (e) {
        logger.error("Failed to set error_exception status:", e);
        // /* ignore set status error */ // 또는 의도적으로 비워둠을 명시
      }
      return null;
    }
  });
