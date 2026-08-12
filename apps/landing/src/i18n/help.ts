import type { Locale } from './index'

interface DesktopGuideStep {
  title: string
  note?: string
  image: string
  imageAlt: string
  compact?: boolean
  warning?: boolean
}

interface DesktopGuideSection {
  id: string
  title: string
  steps: DesktopGuideStep[]
}

interface HelpMessages {
  meta: {
    title: string
    description: string
  }
  eyebrow: string
  title: string
  summary: string
  backHome: string
  language: string
  download: string
  warningLabel: string
  sections: DesktopGuideSection[]
  footer: {
    product: string
    privacy: string
    copyright: string
  }
}

export const desktopDownloadHref = '/zh-CN/#download'

export const helpMessages: Record<Locale, HelpMessages> = {
  'zh-CN': {
    meta: {
      title: 'LockPass 桌面端使用指南',
      description: '跟随真实界面完成 LockPass 桌面端初始化、创建保险库、添加条目和同步。'
    },
    eyebrow: '桌面端使用指南',
    title: '开始使用 LockPass',
    summary: '按顺序完成下面四个部分。',
    backHome: '返回首页',
    language: 'English',
    download: '下载桌面端',
    warningLabel: '重要',
    sections: [
      {
        id: 'setup',
        title: '创建账号并完成初始化',
        steps: [
          {
            title: '选择服务器',
            note: '已有账号登录，没有账号则创建新账号。',
            image: '/screenshots/desktop-guide-server.png',
            imageAlt: 'LockPass 桌面端选择服务器与登录界面'
          },
          {
            title: '验证邮箱',
            image: '/screenshots/desktop-guide-account.png',
            imageAlt: 'LockPass 注册账号并发送邮箱验证码界面',
            compact: true
          },
          {
            title: '设置主密码',
            note: '主密码无法找回，请务必牢记。',
            image: '/screenshots/desktop-guide-master-password.png',
            imageAlt: 'LockPass 设置主密码界面',
            compact: true,
            warning: true
          },
          {
            title: '生成安全密钥',
            image: '/screenshots/desktop-guide-secret-key.png',
            imageAlt: 'LockPass 生成安全密钥界面',
            compact: true
          },
          {
            title: '保存安全密钥',
            note: '保存到离线且安全的位置。',
            image: '/screenshots/desktop-guide-save-secret-key.png',
            imageAlt: 'LockPass 保存安全密钥界面',
            compact: true,
            warning: true
          },
          {
            title: '解锁保险库',
            note: '输入主密码和安全密钥。',
            image: '/screenshots/desktop-guide-unlock.png',
            imageAlt: 'LockPass 桌面端恢复并进入保险库界面'
          }
        ]
      },
      {
        id: 'vault',
        title: '创建保险库',
        steps: [
          {
            title: '点击保险库旁的加号',
            image: '/screenshots/desktop-guide-create-vault.png',
            imageAlt: 'LockPass 创建保险库界面'
          }
        ]
      },
      {
        id: 'items',
        title: '添加条目',
        steps: [
          {
            title: '创建新条目',
            image: '/screenshots/desktop-guide-add-item.png',
            imageAlt: 'LockPass 创建新条目入口'
          },
          {
            title: '选择条目类型',
            image: '/screenshots/desktop-guide-item-type.png',
            imageAlt: 'LockPass 选择条目类型界面',
            compact: true
          },
          {
            title: '填写条目信息',
            image: '/screenshots/desktop-guide-item-form.png',
            imageAlt: 'LockPass 填写登录条目信息界面'
          },
          {
            title: '生成高强度密码',
            image: '/screenshots/desktop-guide-password-generator.png',
            imageAlt: 'LockPass 密码生成器界面'
          },
          {
            title: '完成保存',
            image: '/screenshots/desktop-guide-item-saved.png',
            imageAlt: 'LockPass 已保存的登录条目'
          }
        ]
      },
      {
        id: 'sync',
        title: '同步条目',
        steps: [
          {
            title: '确认服务器已连接',
            note: '连接正常时，条目密文会自动同步。',
            image: '/screenshots/desktop-guide-sync.png',
            imageAlt: 'LockPass 服务器已连接状态',
            compact: true
          }
        ]
      }
    ],
    footer: {
      product: 'LockPass',
      privacy: '隐私政策',
      copyright: 'LockPass Next 项目'
    }
  },
  'en-US': {
    meta: {
      title: 'LockPass Desktop Guide',
      description: 'Follow the real LockPass interface to finish setup, create a vault, add an item, and enable sync.'
    },
    eyebrow: 'Desktop guide',
    title: 'Start using LockPass',
    summary: 'Complete these four sections in order.',
    backHome: 'Back home',
    language: '中文',
    download: 'Download desktop app',
    warningLabel: 'Important',
    sections: [
      {
        id: 'setup',
        title: 'Create an account and finish setup',
        steps: [
          {
            title: 'Choose a server',
            note: 'Sign in or create a new account.',
            image: '/screenshots/desktop-guide-server.png',
            imageAlt: 'LockPass desktop server selection and sign-in screen'
          },
          {
            title: 'Verify your email',
            image: '/screenshots/desktop-guide-account.png',
            imageAlt: 'LockPass account registration and email verification screen',
            compact: true
          },
          {
            title: 'Set the master password',
            note: 'It cannot be recovered. Remember it.',
            image: '/screenshots/desktop-guide-master-password.png',
            imageAlt: 'LockPass master password setup screen',
            compact: true,
            warning: true
          },
          {
            title: 'Generate the Secret Key',
            image: '/screenshots/desktop-guide-secret-key.png',
            imageAlt: 'LockPass Secret Key generation screen',
            compact: true
          },
          {
            title: 'Save the Secret Key',
            note: 'Keep it offline in a safe place.',
            image: '/screenshots/desktop-guide-save-secret-key.png',
            imageAlt: 'LockPass Secret Key backup screen',
            compact: true,
            warning: true
          },
          {
            title: 'Unlock the vault',
            note: 'Enter the master password and Secret Key.',
            image: '/screenshots/desktop-guide-unlock.png',
            imageAlt: 'LockPass desktop vault recovery screen'
          }
        ]
      },
      {
        id: 'vault',
        title: 'Create a vault',
        steps: [
          {
            title: 'Select the plus beside Vaults',
            image: '/screenshots/desktop-guide-create-vault.png',
            imageAlt: 'LockPass create vault screen'
          }
        ]
      },
      {
        id: 'items',
        title: 'Add an item',
        steps: [
          {
            title: 'Create a new item',
            image: '/screenshots/desktop-guide-add-item.png',
            imageAlt: 'LockPass create new item action'
          },
          {
            title: 'Choose the item type',
            image: '/screenshots/desktop-guide-item-type.png',
            imageAlt: 'LockPass item type selection screen',
            compact: true
          },
          {
            title: 'Enter item details',
            image: '/screenshots/desktop-guide-item-form.png',
            imageAlt: 'LockPass login item editor'
          },
          {
            title: 'Generate a strong password',
            image: '/screenshots/desktop-guide-password-generator.png',
            imageAlt: 'LockPass password generator'
          },
          {
            title: 'Save the item',
            image: '/screenshots/desktop-guide-item-saved.png',
            imageAlt: 'Saved LockPass login item'
          }
        ]
      },
      {
        id: 'sync',
        title: 'Sync items',
        steps: [
          {
            title: 'Confirm the server is connected',
            note: 'Item ciphertext syncs automatically while connected.',
            image: '/screenshots/desktop-guide-sync.png',
            imageAlt: 'LockPass server connected status',
            compact: true
          }
        ]
      }
    ],
    footer: {
      product: 'LockPass',
      privacy: 'Privacy policy',
      copyright: 'LockPass Next project'
    }
  }
}
