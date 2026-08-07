<script setup lang="ts">
import type { Vault, VaultItem, VaultItemField, VaultItemFieldKind, VaultItemType } from '@lockpass/core'
import { Plus, Save, Trash2, X } from '@lucide/vue'
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  addableFieldKinds,
  cloneVaultItemFields,
  creatableItemTypes,
  createDefaultFields,
  createField,
  createItemEditorDraft,
  fieldInputType,
  fieldKindLabel,
  isTextareaKind
} from '../itemEditorModel'
import type { ExtensionItemSaveInput } from '@/shared/models'

const props = defineProps<{
  item: VaultItem | null
  vaults: Vault[]
  defaultVaultId: string
  busy: boolean
  error: string
}>()

const emit = defineEmits<{
  cancel: []
  save: [input: ExtensionItemSaveInput]
}>()

const { t } = useI18n()
const draft = reactive<ExtensionItemSaveInput>(createItemEditorDraft(t, props.item, props.defaultVaultId))
const newFieldKind = ref<VaultItemFieldKind>('text')
const validationError = ref('')

const typeOptions = computed(() => {
  if (props.item?.type === 'attachment') return [...creatableItemTypes, 'attachment' as const]
  return creatableItemTypes
})
const saveDisabled = computed(() => Boolean(!draft.vaultId || props.busy))
const displayedError = computed(() => validationError.value || props.error)

watch(
  () => [props.item, props.defaultVaultId] as const,
  () => Object.assign(draft, createItemEditorDraft(t, props.item, props.defaultVaultId)),
  { deep: true }
)

watch(() => draft.title, () => {
  if (draft.title.trim()) validationError.value = ''
})

function changeType(type: VaultItemType): void {
  draft.type = type
  if (!draft.editingItemId) draft.fields = createDefaultFields(t, type)
}

function addField(): void {
  draft.fields.push(createField(t, newFieldKind.value))
}

function removeField(fieldId: string, parent?: VaultItemField): void {
  if (parent?.children) {
    parent.children = parent.children.filter((field) => field.id !== fieldId)
    return
  }
  draft.fields = draft.fields.filter((field) => field.id !== fieldId)
}

function submit(): void {
  if (props.busy || !draft.vaultId) return
  if (!draft.title.trim()) {
    validationError.value = t('error.itemTitleRequired')
    return
  }
  validationError.value = ''
  emit('save', {
    ...draft,
    fields: cloneVaultItemFields(draft.fields)
  })
}
</script>

<template>
  <form class="extension-item-editor" @submit.prevent="submit">
    <header class="extension-editor-header">
      <div>
        <strong>{{ item ? t('editor.editTitle') : t('editor.newTitle') }}</strong>
        <small>{{ item?.title || t('editor.newHint') }}</small>
      </div>
      <button class="icon-button" type="button" :title="t('editor.cancel')" @click="emit('cancel')">
        <X />
      </button>
    </header>

    <div class="extension-editor-scroll">
      <label class="extension-editor-label">
        <span>{{ t('editor.title') }}</span>
        <input v-model="draft.title" class="form-input" autofocus />
      </label>

      <div class="extension-editor-grid">
        <label class="extension-editor-label">
          <span>{{ t('editor.itemType') }}</span>
          <select
            class="form-input"
            :value="draft.type"
            :disabled="Boolean(draft.editingItemId)"
            @change="changeType(($event.target as HTMLSelectElement).value as VaultItemType)"
          >
            <option v-for="type in typeOptions" :key="type" :value="type">{{ t(`type.${type === 'secure-note' ? 'secureNote' : type === 'payment-card' ? 'paymentCard' : type === 'recovery-code' ? 'recoveryCode' : type}`) }}</option>
          </select>
        </label>
        <label class="extension-editor-label">
          <span>{{ t('app.vault') }}</span>
          <select v-model="draft.vaultId" class="form-input">
            <option v-for="vault in vaults" :key="vault.id" :value="vault.id">{{ vault.name }}</option>
          </select>
        </label>
      </div>

      <div class="extension-editor-fields">
        <div v-for="field in draft.fields" :key="field.id" class="extension-editor-field">
          <template v-if="field.kind === 'group'">
            <div class="extension-editor-group-header">
              <input v-model="field.label" class="extension-field-label-input" :aria-label="t('editor.fieldName')" />
              <button class="icon-button" type="button" :title="t('editor.removeField')" @click="removeField(field.id)">
                <Trash2 />
              </button>
            </div>
            <div class="extension-editor-group-fields">
              <div v-for="child in field.children ?? []" :key="child.id" class="extension-editor-field-row">
                <input v-model="child.label" class="extension-field-label-input" :aria-label="t('editor.fieldName')" />
                <textarea v-if="isTextareaKind(child.kind)" v-model="child.value" class="form-input extension-field-value"></textarea>
                <input v-else v-model="child.value" class="form-input extension-field-value" :type="fieldInputType(child)" />
                <button class="icon-button" type="button" :title="t('editor.removeField')" @click="removeField(child.id, field)">
                  <Trash2 />
                </button>
              </div>
            </div>
          </template>
          <div v-else class="extension-editor-field-row">
            <input v-model="field.label" class="extension-field-label-input" :aria-label="t('editor.fieldName')" />
            <span v-if="field.kind === 'attachment'" class="extension-attachment-reference">{{ t('editor.attachmentPreserved') }}</span>
            <textarea v-else-if="isTextareaKind(field.kind)" v-model="field.value" class="form-input extension-field-value"></textarea>
            <input v-else v-model="field.value" class="form-input extension-field-value" :type="fieldInputType(field)" />
            <button class="icon-button" type="button" :title="t('editor.removeField')" @click="removeField(field.id)">
              <Trash2 />
            </button>
          </div>
        </div>
      </div>

      <div v-if="draft.type !== 'attachment'" class="extension-add-field">
        <select v-model="newFieldKind" class="form-input">
          <option v-for="kind in addableFieldKinds" :key="kind" :value="kind">{{ fieldKindLabel(t, kind) }}</option>
        </select>
        <button class="plain-button" type="button" @click="addField">
          <Plus />
          {{ t('editor.addField') }}
        </button>
      </div>

      <label class="extension-editor-label">
        <span>{{ t('app.notes') }}</span>
        <textarea v-model="draft.notes" class="form-input extension-editor-notes"></textarea>
      </label>

    </div>

    <div v-if="displayedError" class="extension-editor-error" role="alert">{{ displayedError }}</div>

    <footer class="extension-editor-footer">
      <button class="plain-button" type="button" :disabled="busy" @click="emit('cancel')">{{ t('editor.cancel') }}</button>
      <button class="primary-button" type="submit" :disabled="saveDisabled">
        <Save />
        {{ busy ? t('editor.saving') : t('editor.save') }}
      </button>
    </footer>
  </form>
</template>
