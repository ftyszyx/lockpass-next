<script setup lang="ts">
import type { VaultItem, VaultItemField } from '@lockpass/core'
import { ArrowLeft, Copy, ExternalLink, Eye, EyeOff, Pencil, Star } from '@lucide/vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  item: VaultItem
  showBack?: boolean
}>()

const emit = defineEmits<{
  back: []
  edit: []
}>()

const { t } = useI18n()
const showSensitive = ref(false)
const copiedFieldId = ref('')

const visibleFields = computed(() => flattenFields(props.item.fields))

function displayValue(field: VaultItemField): string {
  if (!field.sensitive || showSensitive.value) return field.value
  return '••••••••••••'
}

async function copyField(field: VaultItemField): Promise<void> {
  await navigator.clipboard.writeText(field.value)
  copiedFieldId.value = field.id
  window.setTimeout(() => {
    if (copiedFieldId.value === field.id) copiedFieldId.value = ''
  }, 1_500)
}

function fieldLabel(field: VaultItemField): string {
  if (field.label) return field.label
  if (field.kind === 'username' || field.kind === 'email') return t('app.username')
  if (field.kind === 'password' || field.kind === 'secret') return t('app.password')
  if (field.kind === 'url') return t('app.website')
  return field.kind
}

function flattenFields(fields: VaultItemField[]): VaultItemField[] {
  return fields.flatMap((field) => field.kind === 'group' ? flattenFields(field.children ?? []) : [field])
}

function openWebsite(): void {
  const url = props.item.urls[0]
  if (url) window.open(url, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <section class="detail-view">
    <div class="detail-toolbar" :class="{ 'detail-toolbar-without-back': !showBack }">
      <button v-if="showBack" class="icon-button" type="button" :title="t('app.back')" @click="emit('back')">
        <ArrowLeft class="size-4" />
      </button>
      <span class="detail-toolbar-title">{{ item.title }}</span>
      <span class="detail-toolbar-actions">
        <button
          class="icon-button"
          type="button"
          :title="showSensitive ? t('app.hidePassword') : t('app.showPassword')"
          @click="showSensitive = !showSensitive"
        >
          <EyeOff v-if="showSensitive" class="size-4" />
          <Eye v-else class="size-4" />
        </button>
        <button class="icon-button" type="button" :title="t('app.edit')" @click="emit('edit')">
          <Pencil class="size-4" />
        </button>
      </span>
    </div>

    <div class="detail-heading">
      <span class="detail-avatar">{{ item.title.slice(0, 1).toUpperCase() }}</span>
      <span class="detail-heading-copy">
        <strong>{{ item.title }}</strong>
        <small>{{ item.subtitle }}</small>
      </span>
      <Star v-if="item.favorite" class="size-4 fill-amber-400 text-amber-500" />
    </div>

    <div class="detail-fields">
      <div v-for="field in visibleFields" :key="field.id" class="detail-field">
        <span class="detail-field-copy">
          <small>{{ fieldLabel(field) }}</small>
          <strong :class="{ mono: field.sensitive }">{{ displayValue(field) }}</strong>
        </span>
        <button class="icon-button" type="button" :title="t('app.copy')" @click="copyField(field)">
          <span v-if="copiedFieldId === field.id" class="copied-label">{{ t('app.copied') }}</span>
          <Copy v-else class="size-4" />
        </button>
      </div>
    </div>

    <button v-if="item.urls.length" class="plain-button wide-button" type="button" @click="openWebsite">
      <ExternalLink class="size-4" />
      {{ t('app.openWebsite') }}
    </button>

    <div v-if="item.notes" class="detail-notes">
      <small>{{ t('app.notes') }}</small>
      <p>{{ item.notes }}</p>
    </div>
  </section>
</template>
