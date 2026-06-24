<script setup lang="ts">
import { watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { t, useI18n } from '@/i18n'

const route = useRoute()
const { locale } = useI18n()

watchEffect(() => {
  const titleKey = route.meta.titleKey
  const pageTitle = titleKey ? t(titleKey) : t('common.productName')
  void locale.value
  document.title = pageTitle === t('common.productName') ? pageTitle : `${pageTitle} - ${t('common.productName')}`
})
</script>

<template>
  <RouterView />
</template>
