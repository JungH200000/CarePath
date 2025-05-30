import React, {useEffect, useRef, useState} from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  Alert,
  ActivityIndicator,
  Image,
  Platform,
} from 'react-native';
import MapView, {
  PROVIDER_GOOGLE,
  Marker,
  Region,
  MapPressEvent,
  Polyline,
  Polygon,
} from 'react-native-maps';
import {StackNavigationProp} from '@react-navigation/stack';
import {RootStackParamList} from '../navigation/AppNavigator';
import {useNavigation} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import database, {FirebaseDatabaseTypes} from '@react-native-firebase/database';
import useSeniorLocation from '../hooks/useSeniorLocation';
import useLocationHistory from '../hooks/useLocationHistory';
import * as firebaseUtils from '../utils/firebaseUtils';
import RegisteredRouteLayer from '../components/RegisteredRouteLayer';

const arrowImage = require('../assets/images/arrowpin.png');

type LatLng = {latitude: number; longitude: number};

type CaregiverMapScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  'CaregiverMap'
>;

const CaregiverMapScreen = ({}: {}): React.JSX.Element => {
  const navigation = useNavigation<CaregiverMapScreenNavigationProp>();

  const [mapRegion, setMapRegion] = useState<Region | null>(null);
  const [isFollowing, setIsFollowing] = useState(true);
  const isFollowingRef = useRef(true);
  const [groupId, setGroupId] = useState<string | null>(null);

  const {
    seniorLocation,
    isLoading: isLoadingLocation,
    error: locationError,
    seniorUserId,
  } = useSeniorLocation(groupId);

  const {
    polylineSegments: historyPolylineSegments,
    isLoading: isLoadingHistory,
    error: historyError,
  } = useLocationHistory(seniorUserId);

  const [showNoHistoryMessage, setShowNoHistoryMessage] = useState(false);
  const [assignedRouteIds, setAssignedRouteIds] = useState<string[]>([]);
  const assignedIdsListenerRef = useRef<any>(null);
  const onAssignedIdsChangeCallback = useRef<any>(null);

  const [seniorOffRouteStatus, setSeniorOffRouteStatus] = useState<
    string | null
  >(null);
  const [seniorOffRouteTimestamp, setSeniorOffRouteTimestamp] = useState<
    number | null
  >(null);
  const routeAlertsListenerRef = useRef<any>(null); // Firebase 경로 참조
  const onRouteAlertsChangeCallback = useRef<any>(null); // 리스너 콜백

  useEffect(() => {
    const fetchCaregiverInfo = async () => {
      const storedGroupId = await AsyncStorage.getItem('groupId');
      const storedRole = await AsyncStorage.getItem('role');
      setGroupId(storedGroupId);
      if (storedRole !== 'caregiver') {
        console.warn(
          'Non-caregiver user accessed CaregiverMapScreen. Redirecting...',
        );
        navigation.reset({index: 0, routes: [{name: 'Login'}]});
      }
    };
    fetchCaregiverInfo();
  }, [navigation]);

  useEffect(() => {
    if (!isLoadingHistory && !historyError) {
      if (historyPolylineSegments.length === 0) {
        setShowNoHistoryMessage(true);
        const timer = setTimeout(() => setShowNoHistoryMessage(false), 3000);
        return () => clearTimeout(timer);
      } else {
        setShowNoHistoryMessage(false);
      }
    }
  }, [isLoadingHistory, historyError, historyPolylineSegments]);

  useEffect(() => {
    if (assignedIdsListenerRef.current && onAssignedIdsChangeCallback.current) {
      assignedIdsListenerRef.current.off(
        'value',
        onAssignedIdsChangeCallback.current,
      );
    }
    assignedIdsListenerRef.current = null;
    onAssignedIdsChangeCallback.current = null;
    setAssignedRouteIds([]);

    if (groupId && seniorUserId) {
      const assignedRoutesRef = database().ref(
        `/users/${groupId}/${seniorUserId}/assigned_route_ids`,
      );
      assignedIdsListenerRef.current = assignedRoutesRef;

      onAssignedIdsChangeCallback.current = (
        snapshot: FirebaseDatabaseTypes.DataSnapshot,
      ) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          const ids = Object.keys(data);
          setAssignedRouteIds(ids);
        } else {
          setAssignedRouteIds([]);
        }
      };
      assignedRoutesRef.on(
        'value',
        onAssignedIdsChangeCallback.current,
        error => {
          console.error('Error listening to assigned route IDs:', error);
          setAssignedRouteIds([]);
        },
      );
    } else {
      setAssignedRouteIds([]);
    }
    return () => {
      if (
        assignedIdsListenerRef.current &&
        onAssignedIdsChangeCallback.current
      ) {
        assignedIdsListenerRef.current.off(
          'value',
          onAssignedIdsChangeCallback.current,
        );
      }
      assignedIdsListenerRef.current = null;
      onAssignedIdsChangeCallback.current = null;
    };
  }, [groupId, seniorUserId]);

  useEffect(() => {
    // 이전 리스너 정리
    if (routeAlertsListenerRef.current && onRouteAlertsChangeCallback.current) {
      console.log(
        '[CaregiverMapScreen] Detaching previous route_alerts listener.',
      );
      routeAlertsListenerRef.current.off(
        'value',
        onRouteAlertsChangeCallback.current,
      );
    }
    routeAlertsListenerRef.current = null;
    onRouteAlertsChangeCallback.current = null;
    setSeniorOffRouteStatus(null); // 리스너 재설정 시 초기화
    setSeniorOffRouteTimestamp(null);

    if (groupId && seniorUserId) {
      const alertPath = `/route_alerts/${groupId}/${seniorUserId}`;
      const alertsRef = database().ref(alertPath);
      routeAlertsListenerRef.current = alertsRef; // 참조 저장

      console.log(`[CaregiverMapScreen] Attaching listener to ${alertPath}`);

      onRouteAlertsChangeCallback.current = (
        snapshot: FirebaseDatabaseTypes.DataSnapshot,
      ) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          // console.log('[CaregiverMapScreen] Received route alert data:', data);
          if (data && typeof data.status === 'string') {
            setSeniorOffRouteStatus(data.status); // 'off-route' 또는 'on-route'
            setSeniorOffRouteTimestamp(data.timestamp || null);
            if (data.status === 'off-route') {
              // Alert.alert("경로 이탈", "담당 어르신이 경로를 이탈했습니다."); // 즉각적인 시스템 Alert (선택적)
            }
          } else if (data && data.status === null) {
            // 명시적으로 null로 초기화된 경우
            setSeniorOffRouteStatus(null);
            setSeniorOffRouteTimestamp(data.timestamp || null);
          } else {
            // 데이터는 있지만 status가 없거나 유효하지 않은 경우
            setSeniorOffRouteStatus(null);
            setSeniorOffRouteTimestamp(null);
          }
        } else {
          // console.log('[CaregiverMapScreen] No route alert data found.');
          setSeniorOffRouteStatus(null); // 데이터 없으면 null
          setSeniorOffRouteTimestamp(null);
        }
      };

      alertsRef.on(
        'value',
        onRouteAlertsChangeCallback.current,
        (error: any) => {
          console.error(
            `[CaregiverMapScreen] Error listening to route alerts for ${seniorUserId}:`,
            error,
          );
          setSeniorOffRouteStatus(null);
          setSeniorOffRouteTimestamp(null);
        },
      );
    } else {
      // console.log('[CaregiverMapScreen] Cannot attach route_alerts listener: groupId or seniorUserId is missing.');
      setSeniorOffRouteStatus(null);
      setSeniorOffRouteTimestamp(null);
    }

    // 클린업 함수
    return () => {
      if (
        routeAlertsListenerRef.current &&
        onRouteAlertsChangeCallback.current
      ) {
        console.log(
          '[CaregiverMapScreen] Detaching route_alerts listener on unmount.',
        );
        routeAlertsListenerRef.current.off(
          'value',
          onRouteAlertsChangeCallback.current,
        );
      }
      routeAlertsListenerRef.current = null;
      onRouteAlertsChangeCallback.current = null;
    };
  }, [groupId, seniorUserId]); // groupId 또는 seniorUserId 변경 시 리스너 재설정

  useEffect(() => {
    if (seniorLocation && !mapRegion) {
      setMapRegion({
        latitude: seniorLocation.latitude,
        longitude: seniorLocation.longitude,
        latitudeDelta: 0.001,
        longitudeDelta: 0.001,
      });
    }
  }, [seniorLocation, mapRegion]);

  useEffect(() => {
    if (isFollowingRef.current && seniorLocation) {
      setMapRegion(prev => ({
        latitude: seniorLocation.latitude,
        longitude: seniorLocation.longitude,
        latitudeDelta: prev?.latitudeDelta ?? 0.001,
        longitudeDelta: prev?.longitudeDelta ?? 0.001,
      }));
    }
  }, [seniorLocation]);

  const disableFollow = () => {
    if (isFollowingRef.current) {
      isFollowingRef.current = false;
      setIsFollowing(false);
    }
  };
  const handleRegionChangeComplete = (r: Region) => {
    if (!isFollowingRef.current) {
      setMapRegion(r);
    }
  };
  const handleMapPress = (_e: MapPressEvent) => {
    disableFollow();
  };

  const handleGoSeniorLocation = () => {
    if (!seniorLocation) {
      Alert.alert('알림', '노인 위치 정보가 아직 없습니다.');
      return;
    }
    isFollowingRef.current = true;
    setIsFollowing(true);
    setMapRegion(prev => ({
      latitude: seniorLocation.latitude,
      longitude: seniorLocation.longitude,
      latitudeDelta: prev?.latitudeDelta ?? 0.001,
      longitudeDelta: prev?.longitudeDelta ?? 0.001,
    }));
  };

  const handleLogout = async () => {
    try {
      await AsyncStorage.multiRemove(['groupId', 'userId', 'userName', 'role']);
      navigation.reset({index: 0, routes: [{name: 'Login'}]});
    } catch (e) {
      console.error('[CaregiverMapScreen] Logout Error:', e);
      Alert.alert('오류', '로그아웃 중 문제가 발생했습니다.');
    }
  };

  const isOverallLoading = isLoadingLocation || isLoadingHistory;

  if (isOverallLoading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#466FC1" />
        <Text style={styles.loaderText}>
          {isLoadingLocation ? '최신 위치 로딩 중...' : '이동 경로 로딩 중...'}
        </Text>
      </View>
    );
  }

  if (locationError && !seniorLocation) {
    return (
      <View style={styles.loader}>
        <Text style={styles.errorText}>최신 위치 오류</Text>
        <Text style={styles.errorDetails}>{locationError}</Text>
        <TouchableOpacity
          style={styles.logoutBtnOnError}
          onPress={handleLogout}>
          <Text style={styles.btnTxt}>로그아웃</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!mapRegion || (!seniorLocation && !locationError)) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#466FC1" />
        <Text style={styles.loaderText}>지도 데이터 준비 중...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        {...(isFollowing ? {region: mapRegion} : {initialRegion: mapRegion})}
        onPanDrag={disableFollow}
        onRegionChangeComplete={handleRegionChangeComplete}
        onPress={handleMapPress}
        rotateEnabled={false}
        scrollDuringRotateOrZoomEnabled={
          Platform.OS === 'android' ? false : undefined
        }
        showsUserLocation={false}
        showsMyLocationButton={false}>
        {seniorLocation && (
          <Marker coordinate={seniorLocation} anchor={{x: 0.5, y: 0.5}}>
            <Image
              source={arrowImage}
              style={[
                styles.arrow,
                {transform: [{rotate: `${seniorLocation.heading}deg`}]},
              ]}
              resizeMode="contain"
            />
          </Marker>
        )}
        {historyPolylineSegments.map((segment, index) =>
          segment.length > 1 ? (
            <Polyline
              key={`polyline-${index}`}
              coordinates={segment}
              strokeColor="#FF6B6B"
              strokeWidth={4}
              lineCap="round"
              lineJoin="round"
              zIndex={1}
            />
          ) : null,
        )}
        {assignedRouteIds.map(routeId => (
          <RegisteredRouteLayer key={routeId} routeId={routeId} />
        ))}
      </MapView>

      {seniorLocation?.timestamp && (
        <View style={styles.timestampContainer}>
          <Text style={styles.timestampText}>
            업데이트: {new Date(seniorLocation.timestamp).toLocaleTimeString()}
          </Text>
        </View>
      )}
      {(locationError || historyError) && (
        <View
          style={[
            styles.errorOverlay,
            historyError && !locationError
              ? {backgroundColor: 'rgba(255, 165, 0, 0.8)'} // 경로 에러만 있을 시 주황색
              : {backgroundColor: 'rgba(255, 0, 0, 0.7)'}, // 위치 에러 포함 시 빨간색
          ]}>
          <Text style={styles.errorOverlayText}>
            ⚠️ {locationError ? `위치: ${locationError}` : ''}{' '}
            {historyError ? `경로: ${historyError}` : ''}
          </Text>
        </View>
      )}

      {showNoHistoryMessage && (
        <View
          style={[
            styles.infoOverlay,
            {top: locationError || historyError ? 150 : 100},
          ]}>
          <Text style={styles.infoOverlayText}>
            지난 24시간 이동 기록이 없습니다.
          </Text>
        </View>
      )}

      {seniorOffRouteStatus === 'off-route' && (
        <View style={styles.offRouteCaregiverAlert}>
          <Text style={styles.offRouteCaregiverAlertText}>
            ❗️ 사용자가 경로를 이탈했습니다. (발생 시각:{' '}
            {seniorOffRouteTimestamp
              ? new Date(seniorOffRouteTimestamp).toLocaleTimeString()
              : '정보 없음'}
            )
          </Text>
        </View>
      )}

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.btnTxt}>로그아웃</Text>
      </TouchableOpacity>
      <View style={styles.fabBox}>
        <TouchableOpacity style={styles.fab} onPress={handleGoSeniorLocation}>
          <Text style={styles.btnTxt}>위치 확인</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.fab}
          onPress={() => navigation.navigate('Setting')}>
          <Text style={styles.btnTxt}>설정</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default CaregiverMapScreen;

const styles = StyleSheet.create({
  container: {flex: 1},
  map: {flex: 1},
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    padding: 20,
  },
  loaderText: {
    marginTop: 15,
    fontSize: 16,
    color: '#555',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#d9534f',
    marginBottom: 10,
    textAlign: 'center',
  },
  errorDetails: {
    fontSize: 14,
    color: '#555',
    textAlign: 'center',
    marginBottom: 20,
  },
  logoutBtnOnError: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 20,
    marginTop: 20,
  },
  arrow: {width: 35, height: 35},
  logoutBtn: {
    position: 'absolute',
    top: 50,
    left: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 20,
    zIndex: 10,
    elevation: 3,
  },
  fabBox: {
    position: 'absolute',
    bottom: 40,
    right: 20,
    alignItems: 'center',
    zIndex: 10,
  },
  fab: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    elevation: 3,
  },
  btnTxt: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  timestampContainer: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingVertical: 5,
    zIndex: 5,
  },
  timestampText: {
    color: '#fff',
    fontSize: 12,
  },
  errorOverlay: {
    position: 'absolute',
    top: 100,
    left: 20,
    right: 20,
    padding: 10,
    borderRadius: 5,
    zIndex: 15,
    alignItems: 'center',
  },
  errorOverlayText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  infoOverlay: {
    position: 'absolute',
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0, 122, 255, 0.8)',
    padding: 10,
    borderRadius: 5,
    zIndex: 15,
    alignItems: 'center',
  },
  infoOverlayText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  offRouteCaregiverAlert: {
    position: 'absolute',
    top: 50, // 화면 상단 (로그아웃 버튼과 겹치지 않도록)
    left: '10%', // 좌우 여백
    right: '10%',
    backgroundColor: 'rgba(220, 53, 69, 0.9)', // Bootstrap 'danger' color, 진한 빨강
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 8,
    zIndex: 20, // 다른 UI 요소들 위에 표시
    alignItems: 'center',
    elevation: 5, // 안드로이드 그림자
    shadowColor: '#000', // iOS 그림자
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  offRouteCaregiverAlertText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});
