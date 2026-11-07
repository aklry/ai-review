<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { address, connect, message } from '../connection';
const router = useRouter();
const input = ref(address.value);
const error = ref('');
const busy = ref(false);
async function save() {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await connect(input.value);
    await router.replace('/');
  } catch (e) {
    error.value = message(e);
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <router-link v-if="address" to="/">‹ 训练</router-link>
  <h1>连接设置</h1>
  <form class="panel" @submit.prevent="save">
    <label for="endpoint">后端 API 地址</label>
    <input
      id="endpoint"
      v-model="input"
      placeholder="https://your-server.example/api"
      autocapitalize="none"
      spellcheck="false"
      required
    />
    <p class="muted">填写自己的服务器地址，或在开发预览中使用 /api。</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <button class="primary" :disabled="busy">
      {{ busy ? '正在测试连接…' : '测试连接并保存' }}
    </button>
  </form>
</template>
