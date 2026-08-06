export type LoginFieldKind = 'username' | 'currentPassword' | 'newPassword' | 'ignored'

export interface LoginFieldDescriptor {
  type: string
  autocomplete: string
  name: string
  id: string
  placeholder: string
  ariaLabel: string
  disabled: boolean
  readOnly: boolean
}

const USERNAME_HINTS = ['user', 'login', 'email', 'mail', 'account', 'phone', 'mobile', '用户名', '邮箱', '账号', '手机']
const NEW_PASSWORD_HINTS = ['new-password', 'confirm', 'repeat', 'new_password', '新密码', '确认密码']

export function classifyLoginField(field: LoginFieldDescriptor): LoginFieldKind {
  if (field.disabled || field.readOnly) return 'ignored'

  const type = field.type.toLowerCase()
  const autocomplete = field.autocomplete.toLowerCase()
  const hints = `${field.name} ${field.id} ${field.placeholder} ${field.ariaLabel}`.toLowerCase()

  if (type === 'password') {
    if (autocomplete === 'new-password' || NEW_PASSWORD_HINTS.some((hint) => hints.includes(hint))) {
      return 'newPassword'
    }
    return 'currentPassword'
  }

  if (autocomplete === 'username' || type === 'email') return 'username'
  if ((type === 'text' || type === 'tel') && USERNAME_HINTS.some((hint) => hints.includes(hint))) {
    return 'username'
  }

  return 'ignored'
}

export function descriptorForInput(input: HTMLInputElement): LoginFieldDescriptor {
  return {
    type: input.type,
    autocomplete: input.autocomplete,
    name: input.name,
    id: input.id,
    placeholder: input.placeholder,
    ariaLabel: input.getAttribute('aria-label') ?? '',
    disabled: input.disabled,
    readOnly: input.readOnly
  }
}
