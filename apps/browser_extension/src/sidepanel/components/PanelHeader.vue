<script setup lang="ts">
import { Languages, Lock, Plus } from '@lucide/vue'
import { VaultSearchInput } from '@lockpass/ui'
import { useI18n } from 'vue-i18n'
import brandIconUrl from '../../../../desktop/src-tauri/icons/icon.png'
import {
  EXTENSION_LOCALE_OPTIONS,
  isExtensionLocale,
  type ExtensionLocale
} from '@/locales/registry'

defineProps<{
  searchEnabled: boolean
  createEnabled: boolean
  query: string
  locale: ExtensionLocale
  localeEnabled: boolean
  localeBusy: boolean
}>()

const emit = defineEmits<{
  'update:query': [value: string]
  create: []
  lock: []
  localeChange: [locale: ExtensionLocale]
}>()

const { t } = useI18n()

function changeLocale(event: Event): void {
  const locale = (event.target as HTMLSelectElement).value
  if (isExtensionLocale(locale)) emit('localeChange', locale)
}
</script>

<template>
  <header class="panel-header" :class="{ 'panel-header-without-search': !searchEnabled }">
    <div class="brand-lockup">
      <img class="brand-icon" :src="brandIconUrl" alt="" />
      <span v-if="!searchEnabled" class="brand-copy">
        <strong>{{ t('app.title') }}</strong>
        <small>{{ t('app.subtitle') }}</small>
      </span>
    </div>
    <VaultSearchInput
      v-if="searchEnabled"
      class="panel-search"
      :model-value="query"
      :placeholder="t('app.search')"
      @update:model-value="emit('update:query', $event)"
    />
    <div class="header-actions">
      <template v-if="searchEnabled">
        <button class="primary-button" type="button" :disabled="!createEnabled" @click="emit('create')">
          <Plus />
          {{ t('app.newItem') }}
        </button>
        <button class="icon-button" type="button" :title="t('app.lock')" @click="emit('lock')">
          <Lock />
        </button>
      </template>
      <label class="language-picker" :title="t('app.language')">
        <Languages aria-hidden="true" />
        <select
          class="language-select"
          :aria-label="t('app.language')"
          :disabled="!localeEnabled || localeBusy"
          :value="locale"
          @change="changeLocale"
        >
          <option
            v-for="option in EXTENSION_LOCALE_OPTIONS"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </label>
    </div>
  </header>
</template>
