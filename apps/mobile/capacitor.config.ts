import type { CapacitorConfig } from '@capacitor/cli';

export default {
  appId: 'dev.interviewassistant.mobile',
  appName: '面试训练',
  webDir: 'dist',
  backgroundColor: '#f6f7f2',
  server: { cleartext: true },
  android: { allowMixedContent: true },
} satisfies CapacitorConfig;
