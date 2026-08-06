<script setup lang="ts">
import { ShieldCheck } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

defineProps<{
  enabled: boolean
  busy: boolean
}>()

const emit = defineEmits<{
  enable: []
}>()

const { t } = useI18n()
</script>

<template>
  <section class="site-access-bar" :class="{ enabled }">
    <ShieldCheck class="size-4 shrink-0" />
    <span class="site-access-copy">
      <strong>{{ t('app.siteAccess') }}</strong>
      <small>{{ enabled ? t('app.siteAccessOn') : t('app.enableSiteAccessHint') }}</small>
    </span>
    <span v-if="enabled" class="status-dot" aria-hidden="true"></span>
    <button v-else class="compact-button" type="button" :disabled="busy" @click="emit('enable')">
      {{ t('app.enableSiteAccess') }}
    </button>
  </section>
</template>
