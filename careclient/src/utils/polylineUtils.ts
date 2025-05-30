// react-native-maps 또는 화면에서 사용할 좌표 타입
type LatLng = {
  latitude: number;
  longitude: number;
};

// Firebase에서 가져오는 위치 기록 데이터 타입 (timestamp 포함)
type LocationRecord = {
  latitude: number;
  longitude: number;
  heading: number;
  timestamp: number;
};

/**
 * 위치 기록 배열을 시간 간격을 기준으로 분할하여 Polyline 세그먼트 배열로 반환합니다.
 * @param records LocationRecord 객체 배열 (반드시 timestamp 오름차순 정렬).
 * @param maxGapMinutes 분 단위의 최대 허용 시간 간격. 이 시간을 초과하면 Polyline 분할.
 * @returns LatLng 좌표 배열의 배열 (LatLng[][]). 각 내부 배열은 연속된 Polyline 세그먼트.
 */
export const splitPolylineByTimeGap = (
  records: LocationRecord[],
  maxGapMinutes: number,
): LatLng[][] => {
  if (!records || records.length < 2) {
    // 기록이 없거나 1개 뿐이면 분할할 수 없음 (단일 세그먼트 또는 빈 배열 반환)
    return records.length > 0
      ? [[{latitude: records[0].latitude, longitude: records[0].longitude}]]
      : [];
  }

  const segments: LatLng[][] = [];
  let currentSegment: LatLng[] = [];
  const maxGapMilliseconds = maxGapMinutes * 60 * 1000; // 분을 밀리초로 변환

  // 첫 번째 지점 추가
  currentSegment.push({
    latitude: records[0].latitude,
    longitude: records[0].longitude,
  });

  for (let i = 1; i < records.length; i++) {
    const prevRecord = records[i - 1];
    const currentRecord = records[i];

    // 데이터 유효성 검사 (혹시 모를 경우 대비)
    if (
      !prevRecord ||
      !currentRecord ||
      typeof prevRecord.timestamp !== 'number' ||
      typeof currentRecord.timestamp !== 'number' ||
      typeof currentRecord.latitude !== 'number' ||
      typeof currentRecord.longitude !== 'number'
    ) {
      console.warn(
        'Invalid record found during polyline split:',
        currentRecord,
      );
      continue; // 유효하지 않으면 건너뜀
    }

    const timeDifference = currentRecord.timestamp - prevRecord.timestamp;

    // 시간 간격이 최대 허용치 이하인 경우 현재 세그먼트에 추가
    if (timeDifference <= maxGapMilliseconds) {
      currentSegment.push({
        latitude: currentRecord.latitude,
        longitude: currentRecord.longitude,
      });
    }
    // 시간 간격이 초과된 경우
    else {
      // 현재 세그먼트가 유효하면(점 2개 이상) segments에 추가
      if (currentSegment.length > 1) {
        segments.push([...currentSegment]); // 복사본 추가
      }
      // 새 세그먼트 시작 (현재 지점 포함)
      currentSegment = [
        {latitude: currentRecord.latitude, longitude: currentRecord.longitude},
      ];
    }
  }

  // 마지막 세그먼트 추가
  if (currentSegment.length > 1) {
    segments.push([...currentSegment]);
  }

  // console.log(`[splitPolylineByTimeGap] Split into ${segments.length} segments.`); // 디버깅 로그
  return segments;
};
