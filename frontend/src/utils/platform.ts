import { Capacitor } from '@capacitor/core';

export const isMobile = () => {
  return Capacitor.isNativePlatform();
};

export const isAndroid = () => {
  return Capacitor.getPlatform() === 'android';
};

export const isWeb = () => {
  return Capacitor.getPlatform() === 'web';
};

export const getPlatform = () => {
  return Capacitor.getPlatform();
};
