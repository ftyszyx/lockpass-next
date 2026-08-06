import type zhCN from './zh-CN'

type LocaleMessages = {
  [K in keyof typeof zhCN]: {
    [P in keyof (typeof zhCN)[K]]: string
  }
}

const enUS: LocaleMessages = {
  app: {
    title: 'LockPass',
    subtitle: 'Browser extension',
    loading: 'Loading vault...',
    retry: 'Retry',
    lock: 'Lock',
    newItem: 'New',
    edit: 'Edit',
    search: 'Search logins',
    vault: 'Vault',
    vaults: 'Vaults',
    items: 'Items',
    allItems: 'All',
    itemsCount: '{count} items',
    offline: 'Account offline',
    online: 'Saved to server',
    serverUnavailable: 'Server unavailable',
    emptyTitle: 'No items yet',
    emptyBody: 'Your login items will appear here.',
    noResults: 'No matching items',
    openWebsite: 'Open website',
    back: 'Back to item list',
    showPassword: 'Show password',
    hidePassword: 'Hide password',
    copy: 'Copy',
    copied: 'Copied',
    password: 'Password',
    username: 'Username',
    website: 'Website',
    notes: 'Notes',
    selectItem: 'Select an item',
    favorite: 'Favorite',
    siteAccess: 'Inline filling',
    siteAccessOn: 'Enabled',
    siteAccessOff: 'Disabled',
    enableSiteAccess: 'Enable inline filling',
    enableSiteAccessHint: 'Allow LockPass to show its icon in login fields.',
    settings: 'Settings'
  },
  auth: {
    signedOutTitle: 'Sign in to LockPass',
    signedOutBody: 'Sign in to view and fill credentials from your vault.',
    login: 'Sign in',
    createAccount: 'Create account',
    lockedTitle: 'Vault locked',
    lockedBody: 'Enter the master password to continue.',
    firstUnlockBody: 'The Secret Key is required the first time in this browser.',
    masterPassword: 'Master password',
    secretKey: 'Secret Key',
    secretKeyPlaceholder: 'LP-XXXX-XXXX-...',
    unlock: 'Unlock',
    unlocking: 'Unlocking...'
  },
  type: {
    login: 'Login',
    secureNote: 'Secure note',
    paymentCard: 'Payment card',
    attachment: 'Attachment',
    identity: 'Identity',
    recoveryCode: 'Recovery code'
  },
  editor: {
    newTitle: 'New item',
    editTitle: 'Edit item',
    newHint: 'Save to the current vault',
    title: 'Title',
    itemType: 'Type',
    fieldName: 'Field name',
    addField: 'Add field',
    removeField: 'Remove field',
    attachmentPreserved: 'Existing attachments are preserved',
    cancel: 'Cancel',
    save: 'Save',
    saving: 'Saving...'
  },
  fields: {
    username: 'Username',
    password: 'Password',
    website: 'Website',
    email: 'Email',
    phone: 'Phone',
    text: 'Text',
    date: 'Date',
    totp: 'One-time password',
    secret: 'Secret',
    note: 'Note',
    cardholder: 'Cardholder',
    cardNumber: 'Card number',
    expiry: 'Expiry',
    cvv: 'Security code',
    recoveryCode: 'Recovery code',
    group: 'Group'
  },
  error: {
    loadFailed: 'Could not load the extension state.',
    runtimeUnavailable: 'Open LockPass from the Chrome extension.',
    officialWebUrlMissing: 'The sign-in website is not configured.',
    openWebFailed: 'Could not open the sign-in website. Try again.',
    authorizationFailed: 'The sign-in result is invalid. Sign in again.',
    actionFailed: 'The action failed. Try again.',
    permissionDenied: 'Website access was not granted.',
    secretKeyRequired: 'Enter the Secret Key.',
    serverAccessDenied: 'Allow the extension to access this server.',
    serverUnavailable: 'The server is unavailable.',
    authorizationExpired: 'The sign-in has expired. Sign in again.',
    serverVaultMissing: 'No vault is available on the server.',
    secretKeyStorageFailed: 'The Secret Key could not be stored securely.',
    itemTitleRequired: 'Enter an item title.',
    itemConflict: 'This item changed on another device. Unlock again and retry.',
    vaultSessionExpired: 'The encryption session expired. Unlock again.',
    attachmentCreateUnsupported: 'The extension cannot create attachment items yet.',
    itemSaveFailed: 'The item could not be saved. Try again.',
    unlockFailed: 'The master password or Secret Key is incorrect.'
  }
}

export default enUS
