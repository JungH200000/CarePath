import React, {useEffect, useRef, useState, useCallback} from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  Alert,
  ActivityIndicator,
  Image,
  Platform,
  Dimensions,
  Vibration,
  Linking,
} from 'react-native';
import Sound from 'react-native-sound';
import MapView, {
  PROVIDER_GOOGLE,
  Marker,
  Region,
  MapPressEvent,
  Polyline,
  Polygon,
} from 'react-native-maps';
import Geolocation, {
  GeolocationResponse,
} from '@react-native-community/geolocation';
import {StackNavigationProp} from '@react-navigation/stack';
import {RootStackParamList} from '../navigation/AppNavigator';
import {useNavigation} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import useGyroscope from '../hooks/useGyroscope';
import database, {FirebaseDatabaseTypes} from '@react-native-firebase/database';
import useLocationHistory from '../hooks/useLocationHistory';
import * as firebaseUtils from '../utils/firebaseUtils';
import RouteNameInputModal from '../components/RouteNameInputModal';
import RegisteredRouteLayer from '../components/RegisteredRouteLayer';
import {
  isPointInsideAnyBuffer,
  findNearestPointOnRoutes,
  calculateTurnDirection,
} from '../utils/routeUtils';
import OffRouteAlertModal from '../components/OffRouteAlertModal';
import {RegisteredRouteData} from '../hooks/useRegisteredRouteData';
import * as turf from '@turf/turf';
import * as soundUtils from '../utils/soundUtils';

const arrowImage = require('../assets/images/arrowpin.png');
type LatLng = {latitude: number; longitude: number};
type MapScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Map'>;
const screenHeight = Dimensions.get('window').height;

const INTENSE_ALARM_VIBRATION_PATTERN = [0, 100, 50, 100, 50, 100]; // 빠르게 반복
const LEFT_VIBRATION_PATTERN = [0, 100, 100, 100]; // 따-닥
const RIGHT_VIBRATION_PATTERN = [0, 400]; // 길게 한 번
const ALARM_INTERVAL = 2000; // 알람 반복 간격 2초로 변경
const DIRECTION_GUIDANCE_INTERVAL = 2000; // 방향 안내 반복 간격 2초로 변경

// ===== [전화 기능] 상수 정의 =====
const EMERGENCY_NUMBER_112 = '112'; // 긴급 전화번호 (119 또는 112)

const MapScreen = ({}: {}): React.JSX.Element => {
  const navigation = useNavigation<MapScreenNavigationProp>();

  // --- 상태 선언부 ---
  const [currentLocation, setCurrentLocation] = useState<LatLng | null>(null);
  const [mapRegion, setMapRegion] = useState<Region | null>(null);
  const [isFollowing, setIsFollowing] = useState(true);
  const isFollowingRef = useRef(true);
  const watchIdRef = useRef<number | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [mapScreenKey, setMapScreenKey] = useState(0);
  const heading = useGyroscope(100); // 현재 스마트폰 헤딩
  const headingRef = useRef<number>(heading);
  const [isOffRoute, setIsOffRoute] = useState(false);
  const [offRouteStartTime, setOffRouteStartTime] = useState<number | null>(
    null,
  );
  const [offRoutePath, setOffRoutePath] = useState<LatLng[]>([]);
  const [isOffRouteConfirmed, setIsOffRouteConfirmed] = useState(false);
  const [isOffRouteAlertModalVisible, setIsOffRouteAlertModalVisible] =
    useState(false);
  const offRouteConfirmTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [nearestPointOnOriginalRoute, setNearestPointOnOriginalRoute] =
    useState<LatLng | null>(null);
  const [returnGuidanceLineCoords, setReturnGuidanceLineCoords] = useState<
    LatLng[]
  >([]);
  const {
    polylineSegments: historyPolylineSegments,
    isLoading: isLoadingHistory,
    error: historyError,
  } = useLocationHistory(userId, isOffRoute);
  const [showNoHistoryMessage, setShowNoHistoryMessage] = useState(false);
  const [isRegisteringRoute, setIsRegisteringRoute] = useState(false);
  const [currentRouteId, setCurrentRouteId] = useState<string | null>(null);
  const [isRouteNameModalVisible, setIsRouteNameModalVisible] = useState(false);
  const routeRegistrationWatchIdRef = useRef<number | null>(null);
  const [assignedRouteIds, setAssignedRouteIds] = useState<string[]>([]);
  const isOffRouteRef = useRef(isOffRoute);
  const offRouteStartTimeRef = useRef(offRouteStartTime);
  const offRoutePathRef = useRef(offRoutePath);
  const [registeredRoutesDataMap, setRegisteredRoutesDataMap] = useState<
    Record<string, RegisteredRouteData | null>
  >({});
  // ===== 보폭 및 방향 안내 상태 =====
  const [stepsToTarget, setStepsToTarget] = useState<number | null>(null); // 남은 보폭 수
  const [turnDirection, setTurnDirection] = useState<
    'left' | 'right' | 'straight' | null
  >(null); // 회전 방향
  const showOffRouteGuidanceUIRef = useRef(false);
  const setShowOffRouteGuidanceUI = (value: boolean) => {
    // Ref 업데이트 함수
    showOffRouteGuidanceUIRef.current = value;
    // 필요하다면 UI 렌더링을 위해 상태도 유지할 수 있음
    // setShowOffRouteGuidanceUIState(value);
  };
  const STEP_LENGTH = 0.6; // 테스터 보폭 (미터)

  // ===== 음성/진동 관련 상태 및 Ref =====
  const [alarmSound, setAlarmSound] = useState<Sound | null>(null);
  const [leftSound, setLeftSound] = useState<Sound | null>(null);
  const [rightSound, setRightSound] = useState<Sound | null>(null);
  const [isSoundLoading, setIsSoundLoading] = useState<boolean>(true);
  const isAlarmPlayingRef = useRef<boolean>(false);
  const alarmIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // ===== 방향 안내 관련 상태/Ref =====
  const directionGuidanceIntervalRef = useRef<NodeJS.Timeout | null>(null); // 방향 안내 인터벌 ID

  // ===== [전화 기능] 보호자 전화번호 상태 및 로딩 상태 =====
  const [caregiverPhoneNumber, setCaregiverPhoneNumber] = useState<
    string | null
  >(null); // 초기값 null
  const [isLoadingCaregiverPhone, setIsLoadingCaregiverPhone] =
    useState<boolean>(false);

    // ===== 알람 및 진동 관련 함수 (useCallback으로 감싸기) =====
  const startAlarmNotification = useCallback(() => {
    if (isAlarmPlayingRef.current || isSoundLoading) return;
    console.log(
      '[MapScreen] Starting alarm notification (Sound & Vibration)...',
    );
    isAlarmPlayingRef.current = true;
    const playAndVibrate = () => {
      if (!isAlarmPlayingRef.current) return;
      soundUtils.playAlarmSound(alarmSound);
      Vibration.vibrate(INTENSE_ALARM_VIBRATION_PATTERN, false);
    };
    playAndVibrate();
    if (alarmIntervalRef.current) clearInterval(alarmIntervalRef.current);
    alarmIntervalRef.current = setInterval(playAndVibrate, ALARM_INTERVAL);
  }, [alarmSound, isSoundLoading]); // 의존성 확인

  const stopAlarmNotification = useCallback(() => {
    if (!isAlarmPlayingRef.current) return;
    console.log('[MapScreen] Stopping alarm notification.');
    isAlarmPlayingRef.current = false;
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }
    soundUtils.stopSound(alarmSound);
    Vibration.cancel();
  }, [alarmSound]); // 의존성 확인

  // ===== 방향 안내 음성/진동 함수 (useCallback 및 Ref 활용) =====
  const turnDirectionRef = useRef(turnDirection); // turnDirection의 최신 값을 Ref로 관리
  useEffect(() => {
    turnDirectionRef.current = turnDirection;
  }, [turnDirection]);

  const playDirectionSoundAndVibration = useCallback(() => {
    if (!isOffRouteConfirmed || isSoundLoading || isAlarmPlayingRef.current) {
      // console.log('[MapScreen] Direction guidance skipped: not confirmed, sound loading, or alarm playing.');
      return;
    }
    const currentTurnDirection = turnDirectionRef.current; // Ref에서 최신 값 사용
    if (!currentTurnDirection || currentTurnDirection === 'straight') {
      // console.log('[MapScreen] Direction is straight or null. No guidance sound/vibration.');
      return;
    }

    console.log(
      `[MapScreen] Playing direction guidance: ${currentTurnDirection}`,
    );
    let soundToPlay: Sound | null = null;
    let vibrationPattern: number[] | number = 0;

    if (currentTurnDirection === 'left') {
      soundToPlay = leftSound;
      vibrationPattern = LEFT_VIBRATION_PATTERN;
    } else if (currentTurnDirection === 'right') {
      soundToPlay = rightSound;
      vibrationPattern = RIGHT_VIBRATION_PATTERN;
    }

    if (soundToPlay) soundUtils.playSound(soundToPlay);
    if (vibrationPattern !== 0) Vibration.vibrate(vibrationPattern, false);
  }, [
    isOffRouteConfirmed,
    isSoundLoading,
    leftSound,
    rightSound,
    isAlarmPlayingRef,
  ]); // turnDirectionRef는 Ref이므로 의존성 배열에 불필요

  const stopDirectionGuidance = useCallback(() => {
    if (directionGuidanceIntervalRef.current) {
      clearInterval(directionGuidanceIntervalRef.current);
      directionGuidanceIntervalRef.current = null;
    }
    soundUtils.stopSound(leftSound);
    soundUtils.stopSound(rightSound);
    Vibration.cancel();
    console.log('[MapScreen] Direction guidance stopped.');
  }, [leftSound, rightSound]); // 의존성 확인

  // ===== [전화 기능] 전화 거는 함수 (컴포넌트 상단 또는 유틸로 분리 가능) =====
  const makePhoneCall = async (phoneNumber: string) => {
    const telUrl = `tel:${phoneNumber}`;
    try {
      const canOpen = await Linking.canOpenURL(telUrl);
      if (canOpen) {
        await Linking.openURL(telUrl);
      } else {
        Alert.alert(
          '전화 기능 오류',
          `전화 앱을 열 수 없습니다. (${phoneNumber})`,
        );
      }
    } catch (error) {
      Alert.alert('전화 연결 오류', '전화를 거는 중 문제가 발생했습니다.');
      console.error('[MapScreen] Error making phone call:', error);
    }
  };

  // --- useEffect 및 함수 선언부 ---
  useEffect(() => {
    headingRef.current = heading;
  }, [heading]);
  useEffect(() => {
    isOffRouteRef.current = isOffRoute;
  }, [isOffRoute]);
  useEffect(() => {
    offRouteStartTimeRef.current = offRouteStartTime;
  }, [offRouteStartTime]);
  useEffect(() => {
    offRoutePathRef.current = offRoutePath;
  }, [offRoutePath]);

  // Firebase 위치 저장 함수
  const saveLocationToFirebase = async (position: GeolocationResponse) => {
    if (!userId || role !== 'senior') return;
    const {latitude, longitude} = position.coords;
    const locationData = {
      latitude,
      longitude,
      heading: headingRef.current, // 현재 heading 값 사용
      timestamp: database.ServerValue.TIMESTAMP,
    };
    const locationPath = `/locations/${userId}/location_history`;
    try {
      await database().ref(locationPath).push(locationData);
    } catch (error: any) {
      console.error('Error saving location data:', error);
    }
  };

  // ===== 사운드 로딩 및 해제 Effect =====
  useEffect(() => {
    Sound.setCategory('Playback');
    setIsSoundLoading(true);
    console.log('[MapScreen] Loading sounds...');
    Promise.all([
      soundUtils.loadSound('alarm.mp3'),
      soundUtils.loadSound('left.mp3'),
      soundUtils.loadSound('right.mp3'),
    ])
      .then(([alarm, left, right]) => {
        if (alarm) setAlarmSound(alarm);
        if (left) setLeftSound(left);
        if (right) setRightSound(right);
        setIsSoundLoading(false);
        console.log('[MapScreen] Sounds loaded.', {
          alarm: !!alarm,
          left: !!left,
          right: !!right,
        });
        if (!alarm || !left || !right) {
          Alert.alert('오류', '안내 음성 파일을 로드하는데 실패했습니다.');
        }
      })
      .catch(error => {
        console.error('[MapScreen] Error loading sounds:', error);
        setIsSoundLoading(false);
        Alert.alert('오류', '안내 음성 파일을 로드 중 오류가 발생했습니다.');
      });

    return () => {
      console.log('[MapScreen] Releasing sounds...');
      soundUtils.releaseSound(alarmSound);
      soundUtils.releaseSound(leftSound);
      soundUtils.releaseSound(rightSound);
      if (alarmIntervalRef.current) clearInterval(alarmIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 마운트 시 한 번만 실행

  useEffect(() => {
    // "데이터 없음" 메시지 처리 Effect
    if (
      !isLoadingHistory &&
      !historyError &&
      historyPolylineSegments.length === 0
    ) {
      setShowNoHistoryMessage(true);
      const timer = setTimeout(() => setShowNoHistoryMessage(false), 3000);
      return () => clearTimeout(timer);
    } else if (
      !isLoadingHistory &&
      (historyError || historyPolylineSegments.length > 0)
    ) {
      setShowNoHistoryMessage(false);
    }
  }, [isLoadingHistory, historyError, historyPolylineSegments]);

  useEffect(() => {
    /* 사용자 정보 로드 */
    const fetchUserInfo = async () => {
      const storedUserId = await AsyncStorage.getItem('userId');
      const storedRole = await AsyncStorage.getItem('role');
      const storedGroupId = await AsyncStorage.getItem('groupId');
      setUserId(storedUserId);
      setRole(storedRole);
      setGroupId(storedGroupId); // groupId 상태 설정
      if (storedRole && storedRole !== 'senior') {
        navigation.reset({index: 0, routes: [{name: 'Login'}]});
      }
    };
    fetchUserInfo();
  }, [navigation]);

  // ===== [전화 기능] 보호자 전화번호 DB에서 로드 Effect =====
  useEffect(() => {
    const fetchCaregiverPhoneNumber = async () => {
      if (!groupId) {
        // groupId가 없으면 실행 안 함
        // console.log('[MapScreen] GroupId not available yet for fetching caregiver phone.');
        return;
      }
      setIsLoadingCaregiverPhone(true);
      setCaregiverPhoneNumber(null); // 이전 번호 초기화
      // console.log(`[MapScreen] Fetching caregiver phone for groupId: ${groupId}`);
      try {
        const groupUsersRef = database().ref(`/users/${groupId}`);
        const snapshot = await groupUsersRef.once('value');
        if (snapshot.exists()) {
          const users = snapshot.val();
          let foundCaregiverPhone: string | null = null;
          for (const uId in users) {
            // 보호자 ID 패턴 (예: 'caregiver_' 접두사) 또는 role 필드로 보호자 식별
            // 여기서는 role 필드를 우선적으로 확인하고, 없다면 ID 패턴을 확인하는 예시
            if (
              users[uId] &&
              users[uId].role === 'caregiver' &&
              users[uId].phone
            ) {
              foundCaregiverPhone = users[uId].phone;
              break;
            }
            // 또는 ID 패턴으로 찾기 (예: if (uId.startsWith('caregiver_') && users[uId].phone))
          }
          if (foundCaregiverPhone) {
            setCaregiverPhoneNumber(foundCaregiverPhone);
            // console.log(`[MapScreen] Caregiver phone number loaded: ${foundCaregiverPhone}`);
          } else {
            console.warn(
              `[MapScreen] Caregiver phone number not found in DB for groupId: ${groupId}`,
            );
            Alert.alert('알림', '등록된 보호자 전화번호를 찾을 수 없습니다.');
          }
        } else {
          console.warn(`[MapScreen] No users found for groupId: ${groupId}`);
        }
      } catch (error) {
        console.error(
          '[MapScreen] Error fetching caregiver phone number:',
          error,
        );
        Alert.alert(
          '오류',
          '보호자 전화번호를 가져오는 중 오류가 발생했습니다.',
        );
      } finally {
        setIsLoadingCaregiverPhone(false);
      }
    };

    fetchCaregiverPhoneNumber();
  }, [groupId]); // groupId가 변경될 때마다 실행 (예: 로그인 후 groupId 설정 시)
  // ===== [전화 기능 끝] =====

  useEffect(() => {
    /* 할당된 경로 ID 목록 가져오기 */
    if (groupId && userId && role === 'senior') {
      firebaseUtils
        .getAssignedRouteIds(groupId, userId)
        .then(setAssignedRouteIds)
        .catch(error =>
          console.error('Error fetching assigned route IDs:', error),
        );
    } else {
      setAssignedRouteIds([]);
    }
  }, [groupId, userId, role]);

  useEffect(() => {
    /* 등록된 경로 데이터 실시간 로드 */
    const listeners: Record<
      string,
      (snapshot: FirebaseDatabaseTypes.DataSnapshot) => void
    > = {};
    const routeRefs: Record<string, FirebaseDatabaseTypes.Reference> = {};
    if (assignedRouteIds.length === 0) {
      setRegisteredRoutesDataMap({});
      return;
    }
    assignedRouteIds.forEach(routeId => {
      const routeRef = database().ref(`/registered_routes/${routeId}`);
      routeRefs[routeId] = routeRef;
      const listener = (snapshot: FirebaseDatabaseTypes.DataSnapshot) => {
        if (snapshot.exists()) {
          const rawData = snapshot.val();
          const metadata = rawData.metadata || null;
          let points: LatLng[] = [];
          let bufferPolygon: LatLng[] | null = null;
          if (rawData.points) {
            const pointsArray = Object.values(rawData.points) as any[];
            pointsArray.sort(
              (a, b) => (a?.timestamp || 0) - (b?.timestamp || 0),
            );
            points = pointsArray
              .filter(
                p =>
                  p &&
                  typeof p.latitude === 'number' &&
                  typeof p.longitude === 'number',
              )
              .map(p => ({latitude: p.latitude, longitude: p.longitude}));
          }
          if (rawData.buffer_polygon && Array.isArray(rawData.buffer_polygon)) {
            const isValid = (rawData.buffer_polygon as LatLng[]).every(
              (p: LatLng) =>
                p !== null &&
                typeof p.latitude === 'number' &&
                typeof p.longitude === 'number',
            );
            if (isValid) bufferPolygon = rawData.buffer_polygon as LatLng[];
          }
          setRegisteredRoutesDataMap(prevMap => ({
            ...prevMap,
            [routeId]: {metadata, points, bufferPolygon},
          }));
        } else {
          setRegisteredRoutesDataMap(prevMap => {
            const newMap = {...prevMap};
            delete newMap[routeId];
            return newMap;
          });
        }
      };
      listeners[routeId] = listener;
      routeRef.on('value', listener, error =>
        console.error(
          `[MapScreen] Error listening to route ${routeId}:`,
          error,
        ),
      );
    });
    return () => {
      Object.keys(listeners).forEach(routeId => {
        if (routeRefs[routeId] && listeners[routeId]) {
          routeRefs[routeId].off('value', listeners[routeId]);
        }
      });
    };
  }, [assignedRouteIds]);

  useEffect(() => {
    /* 초기 위치 로드 */
    if (role === 'senior') {
      Geolocation.getCurrentPosition(
        ({coords}) => {
          setCurrentLocation({
            latitude: coords.latitude,
            longitude: coords.longitude,
          });
          setMapRegion({
            latitude: coords.latitude,
            longitude: coords.longitude,
            latitudeDelta: 0.001,
            longitudeDelta: 0.001,
          });
          setLoadingLocation(false);
        },
        err => {
          setLoadingLocation(false);
          Alert.alert('위치 오류', '현재 위치를 가져올 수 없습니다.');
        },
        {enableHighAccuracy: true, timeout: 20000, maximumAge: 10000},
      );
    } else if (role && role !== 'senior') {
      setLoadingLocation(false);
    }
  }, [role]);

  useEffect(() => {
    /* 실시간 위치 추적 및 저장 */
    if (!userId || role !== 'senior') {
      if (watchIdRef.current !== null)
        Geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      return;
    }
    let lastSaveTime = 0;
    const SAVE_INTERVAL = 1000;
    const watchOptions = {
      enableHighAccuracy: true,
      distanceFilter: 1,
      interval: 1000,
      fastestInterval: 1000,
    };
    const id = Geolocation.watchPosition(
      (position: GeolocationResponse) => {
        const newCoord = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setCurrentLocation(newCoord);
        if (isFollowingRef.current) {
          setMapRegion(prev => ({
            ...newCoord,
            latitudeDelta: prev?.latitudeDelta ?? 0.001,
            longitudeDelta: prev?.longitudeDelta ?? 0.001,
          }));
        }
        const now = Date.now();
        if (now - lastSaveTime > SAVE_INTERVAL) {
          saveLocationToFirebase(position);
          lastSaveTime = now;
        }
      },
      err => Alert.alert('위치 추적 오류', err.message),
      watchOptions,
    );
    watchIdRef.current = id;
    return () => {
      if (watchIdRef.current !== null)
        Geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    };
  }, [userId, role]);

  useEffect(() => {
    /* 경로 이탈 감지 ( + 알림 중지) */
    if (
      !currentLocation ||
      isRegisteringRoute ||
      Object.keys(registeredRoutesDataMap).length === 0
    ) {
      if (isOffRouteRef.current) {
        setIsOffRoute(false);
        setOffRouteStartTime(null);
        setOffRoutePath([]);
        setNearestPointOnOriginalRoute(null);
        setReturnGuidanceLineCoords([]);
        setStepsToTarget(null);
        setTurnDirection(null);
        setShowOffRouteGuidanceUI(false);
        stopAlarmNotification();
        stopDirectionGuidance();
      }
      return;
    }
    const allBufferPolygons: LatLng[][] = Object.values(registeredRoutesDataMap)
      .map(data => data?.bufferPolygon || null)
      .filter(
        (buffer): buffer is LatLng[] => buffer !== null && buffer.length > 3,
      );
    if (allBufferPolygons.length > 0) {
      const isInside = isPointInsideAnyBuffer(
        currentLocation,
        allBufferPolygons,
      );
      const currentTimestampForOffRoute = Date.now();
      if (!isInside && !isOffRouteRef.current) {
        setIsOffRoute(true);
        setOffRouteStartTime(currentTimestampForOffRoute);
        setOffRoutePath([currentLocation]);
      } else if (isInside && isOffRouteRef.current) {
        setIsOffRoute(false);
        setOffRouteStartTime(null);
        setOffRoutePath([]);
        setNearestPointOnOriginalRoute(null);
        setReturnGuidanceLineCoords([]);
        setStepsToTarget(null);
        setTurnDirection(null);
        setShowOffRouteGuidanceUI(false);
        stopAlarmNotification();
        stopDirectionGuidance();
      } else if (!isInside && isOffRouteRef.current) {
        setOffRoutePath(prevPath => [...prevPath, currentLocation]);
      }
    } else {
      if (isOffRouteRef.current) {
        setIsOffRoute(false);
        setOffRouteStartTime(null);
        setOffRoutePath([]);
        setNearestPointOnOriginalRoute(null);
        setReturnGuidanceLineCoords([]);
        setStepsToTarget(null);
        setTurnDirection(null);
        setShowOffRouteGuidanceUI(false);
        stopAlarmNotification();
        stopDirectionGuidance();
      }
    }
  }, [
    currentLocation,
    isRegisteringRoute,
    registeredRoutesDataMap,
    stopAlarmNotification,
    stopDirectionGuidance,
  ]); // 의존성 확인

  useEffect(() => {
    /* 이탈 확정 (5초) ( + 알람 시작) */
    if (isOffRoute && offRouteStartTime && !isOffRouteConfirmed) {
      if (offRouteConfirmTimerRef.current)
        clearTimeout(offRouteConfirmTimerRef.current);
      offRouteConfirmTimerRef.current = setTimeout(() => {
        if (isOffRouteRef.current) {
          setIsOffRouteConfirmed(true);
          setIsOffRouteAlertModalVisible(true);
          setShowOffRouteGuidanceUI(true);
          startAlarmNotification();
          if (groupId && userId)
            firebaseUtils
              .updateSeniorOffRouteStatus(groupId, userId, 'off-route')
              .catch(err =>
                console.error('[MapScreen] Error notifying caregiver:', err),
              );
        }
        offRouteConfirmTimerRef.current = null;
      }, 5000);
    } else if (
      !isOffRoute &&
      (isOffRouteConfirmed || offRouteConfirmTimerRef.current)
    ) {
      if (offRouteConfirmTimerRef.current) {
        clearTimeout(offRouteConfirmTimerRef.current);
        offRouteConfirmTimerRef.current = null;
      }
      if (isOffRouteConfirmed) {
        setIsOffRouteConfirmed(false);
        setIsOffRouteAlertModalVisible(false);
        setNearestPointOnOriginalRoute(null);
        setReturnGuidanceLineCoords([]);
        setStepsToTarget(null);
        setTurnDirection(null);
        setShowOffRouteGuidanceUI(false);
        stopAlarmNotification();
        stopDirectionGuidance();
        if (groupId && userId)
          firebaseUtils
            .updateSeniorOffRouteStatus(groupId, userId, 'on-route')
            .catch(err =>
              console.error(
                '[MapScreen] Error notifying caregiver about on-route:',
                err,
              ),
            );
      }
    }
    return () => {
      if (offRouteConfirmTimerRef.current)
        clearTimeout(offRouteConfirmTimerRef.current);
      offRouteConfirmTimerRef.current = null;
    };
  }, [
    isOffRoute,
    offRouteStartTime,
    isOffRouteConfirmed,
    groupId,
    userId,
    startAlarmNotification,
    stopAlarmNotification,
    stopDirectionGuidance,
  ]); // 의존성 확인

  // ===== 방향 안내 인터벌 관리 Effect =====
  useEffect(() => {
    if (isOffRouteConfirmed && !isAlarmPlayingRef.current) {
      // 알람이 울리지 않을 때만 방향 안내 시작
      console.log(
        '[MapScreen] Starting direction guidance interval (alarm not playing).',
      );
      if (directionGuidanceIntervalRef.current)
        clearInterval(directionGuidanceIntervalRef.current);
      directionGuidanceIntervalRef.current = setInterval(() => {
        playDirectionSoundAndVibration();
      }, DIRECTION_GUIDANCE_INTERVAL);
    } else {
      // 이탈 확정 아니거나 알람이 울리면 방향 안내 중지
      // console.log('[MapScreen] Stopping direction guidance interval (not off-route confirmed or alarm playing).');
      stopDirectionGuidance();
    }
    return () => {
      // console.log('[MapScreen] Cleaning up direction guidance interval on unmount or dependency change.');
      stopDirectionGuidance(); // 클린업 시에도 확실히 중지
    };
  }, [
    isOffRouteConfirmed,
    isAlarmPlayingRef.current,
    playDirectionSoundAndVibration,
    stopDirectionGuidance,
  ]);

  useEffect(() => {
    /* 가장 가까운 원 경로 지점 및 복귀 안내선 계산 */
    if (
      isOffRouteConfirmed &&
      currentLocation &&
      Object.keys(registeredRoutesDataMap).length > 0
    ) {
      const allOriginalRoutePoints: LatLng[][] = Object.values(
        registeredRoutesDataMap,
      )
        .map(routeData => routeData?.points || null)
        .filter(
          (points): points is LatLng[] => points !== null && points.length >= 2,
        );
      if (allOriginalRoutePoints.length > 0) {
        const nearestPoint = findNearestPointOnRoutes(
          currentLocation,
          allOriginalRoutePoints,
        );
        setNearestPointOnOriginalRoute(nearestPoint);
        if (nearestPoint) {
          setReturnGuidanceLineCoords([currentLocation, nearestPoint]);
        } else {
          setReturnGuidanceLineCoords([]);
        }
      } else {
        setNearestPointOnOriginalRoute(null);
        setReturnGuidanceLineCoords([]);
      }
    } else if (!isOffRouteConfirmed) {
      setNearestPointOnOriginalRoute(null);
      setReturnGuidanceLineCoords([]);
    }
  }, [isOffRouteConfirmed, currentLocation, registeredRoutesDataMap]);
  // --- useEffect 들 끝 ---

  // ===== 보폭 및 방향 계산 로직 Effect =====
  useEffect(() => {
    if (isOffRouteConfirmed && currentLocation && nearestPointOnOriginalRoute) {
      // 1. 보폭 계산
      const currentTurfPoint = turf.point([
        currentLocation.longitude,
        currentLocation.latitude,
      ]);
      const targetTurfPoint = turf.point([
        nearestPointOnOriginalRoute.longitude,
        nearestPointOnOriginalRoute.latitude,
      ]);
      const distanceInMeters = turf.distance(
        currentTurfPoint,
        targetTurfPoint,
        {units: 'meters'},
      );
      const calculatedSteps = Math.max(
        0,
        Math.round(distanceInMeters / STEP_LENGTH),
      ); // 0 미만 방지
      setStepsToTarget(calculatedSteps);

      // 2. 방향 계산
      const bearingToTarget = turf.bearing(currentTurfPoint, targetTurfPoint); // -180 ~ 180 범위
      const direction = calculateTurnDirection(heading, bearingToTarget); // routeUtils 함수 사용
      setTurnDirection(direction);

      // console.log(`[MapScreen] Guidance Update: Steps=${calculatedSteps}, Direction=${direction}, Heading=${heading.toFixed(1)}, Bearing=${bearingToTarget.toFixed(1)}`);
    } else if (!isOffRouteConfirmed) {
      // 복귀 시 또는 초기 상태에서 초기화
      setStepsToTarget(null);
      setTurnDirection(null);
    }
  }, [
    isOffRouteConfirmed,
    currentLocation,
    nearestPointOnOriginalRoute,
    heading,
  ]);

  useEffect(() => {
    if (isOffRouteConfirmed) {
      if (directionGuidanceIntervalRef.current)
        clearInterval(directionGuidanceIntervalRef.current);
      directionGuidanceIntervalRef.current = setInterval(() => {
        playDirectionSoundAndVibration();
      }, DIRECTION_GUIDANCE_INTERVAL);
    } else {
      stopDirectionGuidance();
    }
    return () => {
      if (directionGuidanceIntervalRef.current)
        clearInterval(directionGuidanceIntervalRef.current);
    };
  }, [
    isOffRouteConfirmed,
    playDirectionSoundAndVibration,
    stopDirectionGuidance,
  ]);

  // --- 핸들러 함수들 ---
  const handleToggleRouteRegistration = async () => {
    if (!isRegisteringRoute) {
      if (!userId || !groupId) {
        Alert.alert('오류', '사용자 정보를 가져올 수 없습니다.');
        return;
      }
      try {
        const newRouteId = await firebaseUtils.startNewRoute(userId, groupId);
        setCurrentRouteId(newRouteId);
        setIsRegisteringRoute(true);
        const regWatchOptions = {
          enableHighAccuracy: true,
          distanceFilter: 1,
          interval: 1000,
          fastestInterval: 1000,
        };
        const regWatchId = Geolocation.watchPosition(
          position => {
            if (newRouteId) {
              firebaseUtils
                .addRoutePoint(
                  newRouteId,
                  {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                  },
                  position.timestamp || Date.now(),
                )
                .catch(err => console.error('Failed to add route point:', err));
            }
          },
          error => console.error('Route registration watch error:', error),
          regWatchOptions,
        );
        routeRegistrationWatchIdRef.current = regWatchId;
        Alert.alert('알림', '경로 등록을 시작합니다. 이동해주세요.');
      } catch (error: any) {
        console.error('Error starting route registration:', error);
        Alert.alert('오류', '경로 등록 시작에 실패했습니다.');
        setIsRegisteringRoute(false);
        setCurrentRouteId(null);
      }
    } else {
      if (routeRegistrationWatchIdRef.current !== null) {
        Geolocation.clearWatch(routeRegistrationWatchIdRef.current);
        routeRegistrationWatchIdRef.current = null;
      }
      setIsRouteNameModalVisible(true);
    }
  };

  const handleSaveRouteName = async (routeName: string) => {
    const routeIdToSave = currentRouteId;
    setIsRouteNameModalVisible(false);

    if (!routeIdToSave || !userId || !groupId) {
      Alert.alert('오류', '경로 저장 중 오류 발생 (정보 부족)');
      setIsRegisteringRoute(false);
      setCurrentRouteId(null);
      return;
    }

    try {
      await firebaseUtils.finishRouteRegistration(routeIdToSave, routeName);
      await firebaseUtils.linkRouteToUser(userId, groupId, routeIdToSave);
      Alert.alert('성공', `경로 "${routeName}"이(가) 저장되었습니다.`);

      // 할당된 경로 ID 목록 즉시 다시 불러오기 (assignedRouteIds 상태 업데이트 -> 리스너 재설정 유도)
      const newAssignedIds = await firebaseUtils.getAssignedRouteIds(
        groupId,
        userId,
      );
      setAssignedRouteIds(newAssignedIds); // 이로 인해 위의 경로 데이터 로드 Effect가 다시 실행됨

      // MapScreen 키 변경으로 강제 리마운트는 이제 불필요할 수 있음 (실시간 리스너가 데이터 업데이트)
      // setMapScreenKey(prevKey => prevKey + 1);
      // console.log('[MapScreen] Route saved. Assigned IDs refreshed. Screen key not changed to rely on listeners.');
    } catch (error) {
      console.error('Error finalizing route registration:', error);
      Alert.alert('오류', '경로 저장에 실패했습니다.');
    } finally {
      setIsRegisteringRoute(false);
      setCurrentRouteId(null);
    }
  };

  const handleCloseRouteNameModal = () => {
    setIsRouteNameModalVisible(false);
    setIsRegisteringRoute(false);
    setCurrentRouteId(null);
    Alert.alert(
      '경로 등록 취소',
      '경로 이름 입력을 취소했습니다. 등록이 완료되지 않았습니다.',
    );
  };

  // ===== OffRouteAlertModal 닫기 핸들러 (알람만 중지) =====
  const handleCloseOffRouteAlert = () => {
    setIsOffRouteAlertModalVisible(false);
    console.log('[MapScreen] Off-route alert modal closed by user.');
    stopAlarmNotification(); // 알람 음성/진동만 중지
    // 방향 안내는 인터벌 Effect에 의해 알람이 멈춘 후 자동으로 시작됨
  };

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

  const handleGoMyLocation = () => {
    if (!currentLocation) {
      Alert.alert('알림', '현재 위치 정보가 없습니다.');
      return;
    }
    isFollowingRef.current = true;
    setIsFollowing(true);
    setMapRegion(prev => ({
      latitude: currentLocation.latitude,
      longitude: currentLocation.longitude,
      latitudeDelta: prev?.latitudeDelta ?? 0.001,
      longitudeDelta: prev?.longitudeDelta ?? 0.001,
    }));
  };

  const handleLogout = async () => {
    try {
      if (watchIdRef.current !== null)
        Geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      if (offRouteConfirmTimerRef.current)
        clearTimeout(offRouteConfirmTimerRef.current);
      offRouteConfirmTimerRef.current = null;
      stopAlarmNotification();
      stopDirectionGuidance();
      await AsyncStorage.multiRemove(['groupId', 'userId', 'userName', 'role']);
      navigation.reset({index: 0, routes: [{name: 'Login'}]});
    } catch (e) {
      console.error('[MapScreen] Logout Error:', e);
      Alert.alert('오류', '로그아웃 중 문제가 발생했습니다.');
    }
  };

  const handleCallCaregiver = () => {
    if (isLoadingCaregiverPhone) {
      Alert.alert(
        '정보 로딩 중',
        '보호자 전화번호를 가져오는 중입니다. 잠시 후 다시 시도해주세요.',
      );
      return;
    }
    if (caregiverPhoneNumber) {
      Alert.alert(
        '보호자에게 전화',
        `${caregiverPhoneNumber} 번호로 전화를 거시겠습니까?`,
        [
          {text: '취소', style: 'cancel'},
          {
            text: '전화 걸기',
            onPress: () => makePhoneCall(caregiverPhoneNumber),
          },
        ],
      );
    } else {
      Alert.alert(
        '알림',
        '등록된 보호자 전화번호가 없습니다. 설정을 확인해주세요.',
      );
    }
  };

  const handleCallEmergency = () => {
    Alert.alert(
      '긴급 전화 (112)',
      `${EMERGENCY_NUMBER_112} 번호로 전화를 거시겠습니까?`,
      [
        {text: '취소', style: 'cancel'},
        {text: '전화 걸기', onPress: () => makePhoneCall(EMERGENCY_NUMBER_112)},
      ],
    );
  };
  // --- 핸들러 함수들 끝 ---

  // --- 로딩 UI ---
  const isOverallLoading =
    loadingLocation ||
    isLoadingHistory ||
    isSoundLoading ||
    isLoadingCaregiverPhone;
  if (isOverallLoading || !userId || role !== 'senior') {
    let loadingText = '로딩 중...';
    if (loadingLocation) loadingText = '현재 위치 로딩 중...';
    else if (isLoadingHistory) loadingText = '이동 경로 로딩 중...';
    else if (isSoundLoading) loadingText = '안내음성 준비 중...';
    else if (isLoadingCaregiverPhone) loadingText = '보호자 정보 로딩 중...';
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#466FC1" />
        <Text style={styles.loaderText}>{loadingText}</Text>
      </View>
    );
  }
  // --- 로딩 UI 끝 ---

  // --- 렌더링 ---
  return (
    <View style={styles.container} key={mapScreenKey}>
      {/* 지도 및 마커/Polyline */}
      {currentLocation && mapRegion ? (
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
          <Marker coordinate={currentLocation} anchor={{x: 0.5, y: 0.5}}>
            <Image
              source={arrowImage}
              style={[styles.arrow, {transform: [{rotate: `${heading}deg`}]}]}
              resizeMode="contain"
            />
          </Marker>

          {!isOffRoute &&
            historyPolylineSegments.map(
              (
                segment,
                index, // isOffRoute가 false일때만 그림
              ) =>
                segment.length > 1 ? (
                  <Polyline
                    key={`history-${index}`}
                    coordinates={segment}
                    strokeColor="#007AFF"
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

          {/* 이탈 후 이동 경로 (주황색으로 변경) */}
          {isOffRoute && offRoutePath.length > 1 && (
            <Polyline
              coordinates={offRoutePath}
              strokeColor="#FFA500" // 주황색 (Orange)
              strokeWidth={6}
              zIndex={3}
            />
          )}
          {/* ===== 복귀 안내선 Polyline ===== */}
          {isOffRouteConfirmed && returnGuidanceLineCoords.length === 2 && (
            <Polyline
              coordinates={returnGuidanceLineCoords}
              strokeColor="#B22222" // 진한 빨간색 (FireBrick)
              strokeWidth={10} // 굵게
              zIndex={5} // 다른 선들보다 확실히 위에 표시
            />
          )}
        </MapView>
      ) : (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#466FC1" />
          <Text style={styles.loaderText}>지도 준비 중...</Text>
        </View>
      )}
      {/* ===== 경로 복귀 안내 UI (화면 상단) ===== */}
      {isOffRouteConfirmed && showOffRouteGuidanceUIRef.current && (
        <View style={styles.guidanceContainer}>
          <Text style={styles.guidanceText}>
            {stepsToTarget !== null
              ? `복귀 지점까지 약 ${stepsToTarget}걸음`
              : '거리 계산 중...'}
          </Text>
          <Text style={styles.guidanceText}>
            {turnDirection === 'left'
              ? '목표를 향해 왼쪽으로 도세요'
              : turnDirection === 'right'
              ? '목표를 향해 오른쪽으로 도세요'
              : turnDirection === 'straight'
              ? '목표 방향입니다'
              : '방향 계산 중...'}
          </Text>
        </View>
      )}

      {/* 오오버레이 UI */}
      {historyError && (
        <View style={styles.errorOverlay}>
          <Text style={styles.errorOverlayText}>
            ⚠️ 경로 표시 오류: {historyError}
          </Text>
        </View>
      )}
      {showNoHistoryMessage && (
        <View style={styles.infoOverlay}>
          <Text style={styles.infoOverlayText}>지난 24시간 이동 기록 없음</Text>
        </View>
      )}

      {isOffRouteConfirmed && (
        <View
          style={[
            styles.infoOverlay,
            {
              backgroundColor: 'rgba(255,0,0,0.7)',
              top: historyError || showNoHistoryMessage ? 150 : 100,
            },
          ]}>
          <Text style={styles.infoOverlayText}>⚠️ 경로 이탈 중... (확정)</Text>
        </View>
      )}
      {isOffRoute && !isOffRouteConfirmed && (
        <View
          style={[
            styles.infoOverlay,
            {
              backgroundColor: 'rgba(255, 165, 0, 0.7)',
              top: historyError || showNoHistoryMessage ? 150 : 100,
            },
          ]}>
          <Text style={styles.infoOverlayText}>경로 이탈 감지됨 (확인 중)</Text>
        </View>
      )}

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.btnTxt}>로그아웃</Text>
      </TouchableOpacity>

      <View style={styles.fabContainerRight}>
        <TouchableOpacity
          disabled={
            isOverallLoading || !userId || !groupId || isOffRouteConfirmed
          } // 이탈 확정 시 경로 등록 버튼 비활성화
          style={[
            styles.fab,
            isRegisteringRoute ? styles.fabStop : styles.fabStart,
            (isOverallLoading || !userId || !groupId || isOffRouteConfirmed) &&
              styles.fabDisabled,
          ]}
          onPress={handleToggleRouteRegistration}>
          <Text style={styles.fabText}>
            {isRegisteringRoute ? '등록 종료' : '경로 등록'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={isOverallLoading || !currentLocation}
          style={[
            styles.fab,
            styles.fabSecondary,
            (isOverallLoading || !currentLocation) && styles.fabDisabled,
          ]}
          onPress={handleGoMyLocation}>
          <Text style={styles.fabTextSmall}>내 위치</Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={isOverallLoading}
          style={[
            styles.fab,
            styles.fabSecondary,
            isOverallLoading && styles.fabDisabled,
          ]}
          onPress={() => navigation.navigate('Setting')}>
          <Text style={styles.fabTextSmall}>설정</Text>
        </TouchableOpacity>
      </View>

      {/* ===== [전화 기능] 좌측 하단 전화 버튼 ===== */}
      <View style={styles.fabContainerLeft}>
        <TouchableOpacity
          style={[
            styles.fabCall,
            styles.callCaregiverButton,
            isLoadingCaregiverPhone && styles.fabCallDisabled,
          ]} // 로딩 중 비활성화 스타일
          onPress={handleCallCaregiver}
          disabled={isLoadingCaregiverPhone} // 로딩 중 버튼 비활성화
        >
          <Text style={styles.fabCallText}>
            {isLoadingCaregiverPhone ? '로딩중...' : '보호자'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.fabCall, styles.callEmergencyButton]}
          onPress={handleCallEmergency}>
          <Text style={styles.fabCallText}>112</Text>
        </TouchableOpacity>
      </View>
      {/* ===== [전화 기능 끝] ===== */}

      <RouteNameInputModal
        isVisible={isRouteNameModalVisible}
        onClose={handleCloseRouteNameModal}
        onSave={handleSaveRouteName}
      />

      <OffRouteAlertModal
        isVisible={isOffRouteAlertModalVisible}
        onClose={handleCloseOffRouteAlert}
        message={'경로를 이탈하였습니다.\n화면을 클릭하세요.'}
      />
    </View>
  );
  // --- 렌더링 끝 ---
};

export default MapScreen;

// --- 스타일 ---
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
  fabContainerRight: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    alignItems: 'flex-end',
  },
  fab: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 20,
    marginBottom: 10,
    elevation: 3,
    minWidth: 100,
    alignItems: 'center',
  },
  fabStart: {
    backgroundColor: '#4CAF50',
  },
  fabStop: {
    backgroundColor: '#F44336',
  },
  fabSecondary: {
    width: 70,
    height: 40,
    paddingVertical: 0,
    paddingHorizontal: 0,
    justifyContent: 'center',
    borderRadius: 15,
  },
  fabDisabled: {
    backgroundColor: '#cccccc',
    elevation: 0,
  },
  fabText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  fabTextSmall: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  btnTxt: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  errorOverlay: {
    position: 'absolute',
    top: 100,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(255, 165, 0, 0.8)',
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
  guidanceContainer: {
    position: 'absolute',
    top: 0, // 화면 맨 위
    left: 0,
    right: 0,
    height: screenHeight / 3, // 화면 높이의 1/3
    backgroundColor: 'rgba(0, 0, 0, 0.75)', // 반투명 검정 배경
    padding: 15,
    justifyContent: 'center', // 내용을 세로 중앙에 배치
    alignItems: 'center', // 내용을 가로 중앙에 배치
    zIndex: 20, // 다른 오버레이보다 위에 표시
  },
  guidanceText: {
    color: '#FFFFFF', // 흰색 텍스트
    fontSize: 28, // 텍스트 크기
    fontWeight: 'bold', // 굵게
    textAlign: 'center', // 가운데 정렬
    marginBottom: 15, // 텍스트 간 간격
  },
  fabContainerLeft: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    alignItems: 'flex-start', // 왼쪽 정렬
  },
  fabCall: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingVertical: 10,
    paddingHorizontal: 20, // 좌우 패딩 늘림
    borderRadius: 20,
    marginBottom: 10,
    elevation: 3,
    minWidth: 100, // 최소 너비
    alignItems: 'center',
    justifyContent: 'center',
    height: 50, // 높이 고정
  },
  callCaregiverButton: {
    backgroundColor: '#28a745', // 초록색 (보호자)
  },
  callEmergencyButton: {
    backgroundColor: '#dc3545', // 빨간색 (긴급)
  },
  fabCallText: {
    color: '#fff',
    fontSize: 16, // 버튼 텍스트 크기
    fontWeight: 'bold',
  },
  fabCallDisabled: {
    backgroundColor: '#cccccc', // 회색으로 변경
    opacity: 0.7, // 약간 투명하게
  },
});
