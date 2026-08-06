import { classifyLoginField, descriptorForInput, type LoginFieldKind } from './fieldClassifier'

export interface CredentialValues {
  username: string
  password: string
}

export function fillCredentialFromField(activeField: HTMLInputElement, credential: CredentialValues): void {
  const scope = activeField.form ?? activeField.ownerDocument
  const inputs = Array.from(scope.querySelectorAll<HTMLInputElement>('input'))
    .filter(isUsableInput)

  const usernameField = chooseField(activeField, inputs, 'username')
  const passwordField = chooseField(activeField, inputs, 'currentPassword')

  if (usernameField && credential.username) setInputValue(usernameField, credential.username)
  if (passwordField && credential.password) setInputValue(passwordField, credential.password)
}

export function fillGeneratedPasswordFromField(activeField: HTMLInputElement, password: string): void {
  const scope = activeField.form ?? activeField.ownerDocument
  const inputs = Array.from(scope.querySelectorAll<HTMLInputElement>('input'))
    .filter(isUsableInput)
  const passwordFields = inputs.filter(
    (input) => classifyLoginField(descriptorForInput(input)) === 'newPassword'
  )

  if (!passwordFields.includes(activeField)) passwordFields.unshift(activeField)
  for (const input of new Set(passwordFields)) setInputValue(input, password)
}

function chooseField(
  activeField: HTMLInputElement,
  inputs: HTMLInputElement[],
  kind: LoginFieldKind
): HTMLInputElement | null {
  if (classifyLoginField(descriptorForInput(activeField)) === kind) return activeField
  return inputs.find((input) => classifyLoginField(descriptorForInput(input)) === kind) ?? null
}

function isUsableInput(input: HTMLInputElement): boolean {
  return !input.disabled && !input.readOnly && input.type !== 'hidden'
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText', data: value }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}
