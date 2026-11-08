import type { CapacitorConfig } from '@capacitor/cli';

export default {
  appId: 'dev.interviewassistant.mobile',
  appName: '面试训练',
  webDir: 'dist',
  server: { cleartext: true },
  android: { allowMixedContent: true },
} satisfies CapacitorConfig;
