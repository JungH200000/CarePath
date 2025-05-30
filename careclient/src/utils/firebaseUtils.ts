// firebase 관련 함수 모음
// careclient/src/utils/firebaseUtils.ts

import database from '@react-native-firebase/database';

// react-native-maps 좌표 타입 (또는 공통 타입 정의)
type LatLng = {
  latitude: number;
  longitude: number;
};

// 경로 메타데이터 타입
export type RouteMetadata = {
  name: string;
  created_at: number; // 등록 시작 시간
  finished_at?: number; // 등록 종료 시간
  created_by_senior_id: string;
  group_id: string;
  buffer_meters?: number; // 완충 지대
};

/**
 * Firebase 'registered_routes'에 새 경로 노드를 생성하고 routeId를 반환합니다.
 * 초기 메타데이터를 저장합니다.
 * @param userId 등록하는 사용자의 seniorId
 * @param groupId 사용자의 groupId
 * @returns 생성된 routeId (Promise)
 * @throws 에러 발생 시
 */
export const startNewRoute = async (
  userId: string,
  groupId: string,
): Promise<string> => {
  console.log('[firebaseUtils] Starting new route registration...');
  const newRouteRef = database().ref('/registered_routes').push(); // 새 경로를 위한 고유 키 생성
  const routeId = newRouteRef.key;

  if (!routeId) {
    throw new Error('Failed to generate a unique route ID.');
  }

  const initialMetadata: Partial<RouteMetadata> = {
    // 초기에는 일부 필드만 설정
    created_at: Date.now(),
    created_by_senior_id: userId,
    group_id: groupId,
    name: '미정',
  };

  try {
    // 메타데이터 노드에 초기 정보 저장
    await newRouteRef.child('metadata').set(initialMetadata);
    console.log(
      `[firebaseUtils] Initial metadata saved for routeId: ${routeId}`,
    );
    return routeId;
  } catch (error) {
    console.error(
      '[firebaseUtils] Error saving initial route metadata:',
      error,
    );
    throw error;
  }
};

/**
 * 특정 경로의 points 아래에 새로운 위치 좌표를 추가합니다.
 * @param routeId 대상 경로의 ID
 * @param coordinate 추가할 좌표 (LatLng)
 * @param timestamp 좌표의 타임스탬프
 * @returns Promise<void>
 * @throws 에러 발생 시
 */
export const addRoutePoint = async (
  routeId: string,
  coordinate: LatLng,
  timestamp: number,
): Promise<void> => {
  const pointData = {
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    timestamp: timestamp, // Geolocation에서 받은 타임스탬프 사용
  };
  const pointsRef = database().ref(`/registered_routes/${routeId}/points`);

  try {
    await pointsRef.push(pointData); // push로 자동 ID 생성하며 저장
    // console.log(`[firebaseUtils] Added point to routeId ${routeId}:`, coordinate);
  } catch (error) {
    console.error('[firebaseUtils] Error adding route point:', error);
    throw error;
  }
};

/**
 * 경로 등록 완료 후 메타데이터(이름, 종료시간 등)를 업데이트합니다.
 * @param routeId 대상 경로의 ID
 * @param routeName 사용자가 입력한 경로 이름
 * @returns Promise<void>
 * @throws 에러 발생 시
 */
export const finishRouteRegistration = async (
  routeId: string,
  routeName: string,
): Promise<void> => {
  console.log(
    `[firebaseUtils] Finishing registration for routeId: ${routeId} with name: ${routeName}`,
  );
  const metadataRef = database().ref(`/registered_routes/${routeId}/metadata`);
  const updates: Partial<RouteMetadata> = {
    name: routeName,
    finished_at: Date.now(), // 종료 시간 기록
  };

  try {
    await metadataRef.update(updates); // 이름과 종료 시간 업데이트
    console.log(
      `[firebaseUtils] Route metadata updated for routeId: ${routeId}`,
    );
  } catch (error) {
    console.error('[firebaseUtils] Error finishing route registration:', error);
    throw error;
  }
};

/**
 * 사용자 프로필의 assigned_route_ids에 등록된 경로 ID를 연결합니다.
 * @param userId 대상 사용자의 seniorId
 * @param groupId 사용자의 groupId
 * @param routeId 연결할 경로 ID
 * @returns Promise<void>
 * @throws 에러 발생 시
 */
export const linkRouteToUser = async (
  userId: string,
  groupId: string,
  routeId: string,
): Promise<void> => {
  console.log(
    `[firebaseUtils] Linking route ${routeId} to user ${userId} in group ${groupId}`,
  );
  const userRouteLinkRef = database().ref(
    `/users/${groupId}/${userId}/assigned_route_ids/${routeId}`,
  );

  try {
    await userRouteLinkRef.set(true); // 경로 ID를 키로, 값을 true로 설정하여 연결 표시
    console.log(`[firebaseUtils] Route ${routeId} linked to user ${userId}`);
  } catch (error) {
    console.error('[firebaseUtils] Error linking route to user:', error);
    throw error;
  }
};

/**
 * 특정 사용자에게 할당된 경로 ID 목록을 가져옵니다.
 * @param userId 대상 사용자의 seniorId
 * @param groupId 사용자의 groupId
 * @returns 할당된 routeId 배열 (Promise<string[]>)
 * @throws 에러 발생 시
 */
export const getAssignedRouteIds = async (
  groupId: string,
  userId: string,
): Promise<string[]> => {
  if (!groupId || !userId) {
    console.warn(
      '[firebaseUtils] Cannot get assigned routes: groupId or userId is missing.',
    );
    return []; // 빈 배열 반환
  }
  const assignedRoutesRef = database().ref(
    `/users/${groupId}/${userId}/assigned_route_ids`,
  );

  try {
    const snapshot = await assignedRoutesRef.once('value');
    if (snapshot.exists()) {
      const data = snapshot.val();
      // assigned_route_ids 아래의 키(routeId)들을 배열로 반환
      return Object.keys(data);
    } else {
      return []; // 할당된 경로 없음
    }
  } catch (error) {
    console.error(
      `[firebaseUtils] Error getting assigned route IDs for user ${userId}:`,
      error,
    );
    throw error; // 에러 다시 던지기
  }
};

/**
 * 노인의 경로 이탈 상태를 Firebase DB에 업데이트합니다.
 * @param groupId 노인이 속한 그룹 ID
 * @param seniorId 노인의 사용자 ID
 * @param status 이탈 상태 ('off-route', 'on-route', 또는 null/undefined로 초기화)
 */
export const updateSeniorOffRouteStatus = async (
  groupId: string | null,
  seniorId: string | null,
  status: 'off-route' | 'on-route' | null,
): Promise<void> => {
  if (!groupId || !seniorId) {
    console.warn(
      '[firebaseUtils] Cannot update off-route status: groupId or seniorId is missing.',
    );
    return;
  }

  const alertPath = `/route_alerts/${groupId}/${seniorId}`;
  const statusData = {
    status: status,
    timestamp: database.ServerValue.TIMESTAMP, // 서버 시간으로 타임스탬프 기록
    last_location:
      status === 'off-route'
        ? (
            await database()
              .ref(`/locations/${seniorId}/location_history`)
              .orderByKey()
              .limitToLast(1)
              .once('value')
          ).val()
        : null,
    // 필요하다면 이탈 시점의 마지막 위치 정보도 함께 저장할 수 있습니다.
    // 예: const lastLocationSnapshot = await database().ref(`/locations/${seniorId}/location_history`).orderByKey().limitToLast(1).once('value');
    // last_location: status === 'off-route' ? lastLocationSnapshot.val() : null,
  };

  try {
    await database().ref(alertPath).update(statusData);
    console.log(
      `[firebaseUtils] Senior off-route status updated for ${seniorId} in group ${groupId} to: ${status}`,
    );
  } catch (error) {
    console.error(
      `[firebaseUtils] Error updating senior off-route status for ${seniorId}:`,
      error,
    );
    // throw error; // 호출한 쪽에서 에러를 처리하도록 할 수 있음
  }
};
