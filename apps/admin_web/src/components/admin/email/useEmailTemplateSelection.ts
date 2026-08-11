import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { t } from '@/i18n'
import type { EmailTemplateSummary } from '@/types'

export function useEmailTemplateSelection(
  templatesSource: MaybeRefOrGetter<EmailTemplateSummary[]>,
  preferredLocaleSource: MaybeRefOrGetter<string>
) {
  const selectedEvent = ref('')
  const selectedLocale = ref('')
  const templates = computed(() => toValue(templatesSource))

  const templateOptions = computed(() => {
    const events = [...new Set(templates.value.map((template) => template.event))]
    const preferredLocale = toValue(preferredLocaleSource)
    return events.map((event) => {
      const matches = templates.value.filter((template) => template.event === event)
      const displayTemplate = matches.find((template) => template.locale === selectedLocale.value)
        ?? matches.find((template) => template.locale === preferredLocale)
        ?? matches[0]
      return { value: event, label: displayTemplate?.name ?? event }
    })
  })

  const localeOptions = computed(() => [
    ...new Set(
      templates.value
        .filter((template) => template.event === selectedEvent.value)
        .map((template) => template.locale)
    )
  ])

  const selectedTemplate = computed(() => templates.value.find((template) => (
    template.event === selectedEvent.value && template.locale === selectedLocale.value
  )))

  function syncEvent() {
    if (!templateOptions.value.some((option) => option.value === selectedEvent.value)) {
      selectedEvent.value = templateOptions.value[0]?.value ?? ''
    }
  }

  function syncLocale() {
    if (localeOptions.value.includes(selectedLocale.value)) return
    const preferredLocale = toValue(preferredLocaleSource)
    selectedLocale.value = localeOptions.value.includes(preferredLocale)
      ? preferredLocale
      : localeOptions.value[0] ?? ''
  }

  watch([templates, () => toValue(preferredLocaleSource)], () => {
    syncEvent()
    syncLocale()
  }, { immediate: true })
  watch(selectedEvent, syncLocale)

  return {
    selectedEvent,
    selectedLocale,
    selectedTemplate,
    templateOptions,
    localeOptions
  }
}

export function emailTemplateLocaleLabel(locale: string): string {
  if (locale === 'zh-CN') return t('localeNames.zhCN')
  if (locale === 'en-US') return t('localeNames.enUS')
  return locale
}
