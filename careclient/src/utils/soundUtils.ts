// src/utils/soundUtils.ts

import Sound from 'react-native-sound';

// Sound 객체를 로드하는 함수
export const loadSound = (soundFile: string): Promise<Sound | null> => {
  return new Promise(resolve => {
    const soundInstance = new Sound(soundFile, Sound.MAIN_BUNDLE, error => {
      if (error) {
        console.error(
          `[soundUtils] failed to load the sound ${soundFile}`,
          error,
        );
        resolve(null);
        return;
      }
      // console.log(`[soundUtils] successfully loaded sound ${soundFile}`); // 로딩 성공 로그
      resolve(soundInstance);
    });
  });
};

// 사운드를 재생하는 함수
export const playSound = (sound: Sound | null, onEnd?: () => void): void => {
  if (sound) {
    sound.play(success => {
      if (success) {
        // console.log(`[soundUtils] successfully finished playing`); // getFilename() 제거
        onEnd?.();
      } else {
        console.error(
          `[soundUtils] playback failed due to audio decoding errors`,
        ); // getFilename() 제거
      }
    });
  } else {
    console.warn('[soundUtils] Sound object is null, cannot play sound.');
  }
};

// 사운드 재생을 중지하는 함수
export const stopSound = (sound: Sound | null): void => {
  if (sound && sound.isPlaying()) {
    sound.stop(() => {
      // console.log(`[soundUtils] Stopped sound`); // getFilename() 제거
    });
  }
};

// 사운드 객체의 리소스를 해제하는 함수
export const releaseSound = (sound: Sound | null): void => {
  if (sound) {
    sound.release();
    // console.log(`[soundUtils] Released sound`); // getFilename() 제거
  }
};

// 반복 재생을 위한 함수
export const playAlarmSound = (sound: Sound | null): void => {
  if (sound) {
    if (sound.isPlaying()) {
      sound.stop(() => {
        sound.setCurrentTime(0);
        sound.play(success => {
          if (!success) {
            console.error('[soundUtils] Alarm sound playback failed.');
          } // 간단한 에러 로깅 추가
        });
      });
    } else {
      sound.setCurrentTime(0);
      sound.play(success => {
        if (!success) {
          console.error('[soundUtils] Alarm sound playback failed.');
        } // 간단한 에러 로깅 추가
      });
    }
  } else {
    console.warn('[soundUtils] Alarm sound object is null.');
  }
};
