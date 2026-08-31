<script setup lang="ts">
import { ref } from 'vue';

const interviewLanguage = ref<'zh-CN' | 'en-US' | 'mixed'>('zh-CN');
const interviewDifficulty = ref<'l1' | 'l2' | 'l3'>('l2');
</script>

<template>
  <section class="view training-view">
    <header class="view-header">
      <div>
        <p class="eyebrow">SIMULATION SETUP</p>
        <h1>训练配置</h1>
      </div>
    </header>

    <el-form class="setup-form" label-position="top">
      <el-form-item label="面试语言">
        <el-radio-group v-model="interviewLanguage">
          <el-radio-button value="zh-CN">中文</el-radio-button>
          <el-radio-button value="en-US">English</el-radio-button>
          <el-radio-button value="mixed">中英混合</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="默认难度">
        <el-radio-group v-model="interviewDifficulty">
          <el-radio-button value="l1">L1 基础</el-radio-button>
          <el-radio-button value="l2">L2 进阶</el-radio-button>
          <el-radio-button value="l3">L3 挑战</el-radio-button>
        </el-radio-group>
      </el-form-item>
    </el-form>
  </section>
</template>
