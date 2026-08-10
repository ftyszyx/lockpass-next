import { ApiError } from '@/api/client'
import { t } from '@/i18n'

const errorCodeMessages: Record<string, Parameters<typeof t>[0]> = {
  unauthorized: 'errors.unauthorized',
  forbidden: 'errors.forbidden',
  conflict: 'errors.conflict',
  current_password_incorrect: 'errors.currentPasswordIncorrect',
  password_unchanged: 'errors.passwordUnchanged',
  cannot_disable_current_account: 'errors.cannotDisableCurrentAccount',
  cannot_disable_last_enabled_admin: 'errors.cannotDisableLastEnabledAdmin',
  cannot_remove_current_admin_role: 'errors.cannotRemoveCurrentAdminRole',
  bad_request: 'errors.badRequest',
  not_found: 'errors.notFound',
  internal_error: 'errors.internalError'
}

export function userFacingErrorMessage(cause: unknown): string {
  if (cause instanceof ApiError) {
    const key = cause.errorCode ? errorCodeMessages[cause.errorCode] : undefined
    if (key) return t(key)
    if (cause.status >= 500) return t('errors.internalError')
    return t('errors.requestFailed')
  }
  if (cause instanceof TypeError) return t('errors.networkError')
  return t('errors.requestFailed')
}
