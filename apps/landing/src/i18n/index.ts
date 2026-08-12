export const locales = ['zh-CN', 'en-US'] as const

export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'zh-CN'

export const localeLabels: Record<Locale, string> = {
  'zh-CN': '中文',
  'en-US': 'English'
}

export const messages = {
  'zh-CN': {
    meta: {
      title: 'LockPass - 本地优先的密码管理器',
      description:
        'LockPass 是本地优先、端到端加密、支持自部署同步服务的桌面密码管理器。'
    },
    nav: {
      features: '功能',
      screenshots: '截图',
      security: '安全',
      workflow: '使用流程',
      download: '软件下载',
      guide: '使用说明',
      help: '帮助',
      github: '在 GitHub 上查看源码',
      language: 'English'
    },
    hero: {
      eyebrow: '桌面密码管理器',
      title: 'LockPass',
      highlight: '你的密码，只属于你。',
      subtitle: '本地优先、端到端加密，主密码与安全密钥双重保护。',
      primaryCta: '下载客户端',
      secondaryCta: '查看使用说明',
      visualAlt: 'LockPass 桌面端保险库主界面',
      versionPrefix: '当前版本',
      platformNote: 'Windows x64',
      trustItems: ['本地离线可用', '端到端加密同步', '支持自部署服务器']
    },
    featureSection: {
      eyebrow: '产品能力',
      title: '密码库明文只留在你的设备上',
      items: [
        {
          title: '本地优先保险库',
          body: '默认保存在本机，离线也能用。'
        },
        {
          title: '主密码与安全密钥',
          body: '两者共同解锁，缺一不可。'
        },
        {
          title: '端到端加密同步',
          body: '服务器只保存密文。'
        },
        {
          title: '自部署同步服务',
          body: '数据控制权始终在你手上。'
        }
      ]
    },
    securitySection: {
      eyebrow: '安全架构',
      title: '你的密码，只有你的设备能读懂',
      intro: '主密码 + 安全密钥，Argon2id 派生，AES-256-GCM 加密，服务器只见密文。',
      points: [
        {
          title: '主密码 + 安全密钥',
          body: '两者共同派生解锁密钥，缺一不可。'
        },
        {
          title: 'Argon2id 密钥派生',
          body: '大幅提高离线猜测主密码的成本。'
        },
        {
          title: 'AES-256-GCM 加密',
          body: '条目与附件全部在本机加解密。'
        },
        {
          title: '零明文上传',
          body: '服务器不接触任何可解密的明文。'
        }
      ],
      diagram: {
        master: '主密码',
        secret: '安全密钥',
        kdf: 'Argon2id 派生',
        unlockKey: 'unlockKey',
        wrap: 'AES-256-GCM 包装',
        vaultKey: 'vaultKey',
        wrapped: 'wrappedVaultKey（仅密文）',
        storage: '本地密文库与服务器',
        note: '服务器无法读取任何明文'
      }
    },
    downloadSection: {
      eyebrow: '客户端下载',
      title: '全部下载',
      intro: '选择适合你的 Windows 安装包。',
      download: '下载',
      loading: '正在读取...',
      unavailable: '暂不可用',
      recommended: '推荐下载',
      groups: {
        windows: 'Windows'
      },
      platforms: {
        windowsX64: 'Windows (64 位)'
      }
    },
    workflowSection: {
      eyebrow: '使用流程',
      title: '四步即可开始使用',
      steps: [
        {
          title: '安装桌面端',
          body: '下载安装包，一键完成安装。'
        },
        {
          title: '创建本地身份',
          body: '设置主密码，生成安全密钥。'
        },
        {
          title: '建立保险库和条目',
          body: '添加登录、笔记、银行卡等条目。'
        },
        {
          title: '连接同步服务器',
          body: '登录账号，绑定当前设备。'
        }
      ]
    },
    serverSection: {
      eyebrow: '同步服务器',
      title: '官方服务和自部署使用同一套绑定逻辑',
      body: '邮箱、短信、OAuth 或自部署入口，统一进入同一套账号绑定流程。'
    },
    faqSection: {
      eyebrow: '常见问题',
      title: '开始使用前，先确认这三件事',
      items: [
        {
          question: '服务器能看到我的密码吗？',
          answer: '不能。服务器只保存密文，明文只在桌面端解密。'
        },
        {
          question: '不连接同步服务器可以用吗？',
          answer: '可以。离线也能管理保险库，同步只是多设备增强。'
        },
        {
          question: '安全密钥和主密码有什么区别？',
          answer: '主密码日常解锁；安全密钥用于新设备恢复。'
        }
      ]
    },
    footer: {
      product: 'LockPass',
      tagline: '本地优先、端到端加密、可自部署。',
      supportQqLabel: '客服 QQ',
      copyright: 'LockPass Next 项目',
      privacy: '隐私政策'
    }
  },
  'en-US': {
    meta: {
      title: 'LockPass - Local-first password manager',
      description:
        'LockPass is a local-first desktop password manager with end-to-end encrypted sync and a self-hostable server.'
    },
    nav: {
      features: 'Features',
      screenshots: 'Screenshots',
      security: 'Security',
      workflow: 'Workflow',
      download: 'Download',
      guide: 'Guide',
      help: 'Help',
      github: 'View source on GitHub',
      language: '中文'
    },
    hero: {
      eyebrow: 'Desktop password manager',
      title: 'LockPass',
      highlight: 'Your passwords, yours alone.',
      subtitle: 'Local-first and end-to-end encrypted, protected by a master password and Secret Key.',
      primaryCta: 'Download',
      secondaryCta: 'Read the guide',
      visualAlt: 'LockPass desktop vault home',
      versionPrefix: 'Current version',
      platformNote: 'Windows x64',
      trustItems: ['Works offline', 'End-to-end encrypted sync', 'Self-hostable server']
    },
    featureSection: {
      eyebrow: 'Product',
      title: 'Plaintext vault data stays on your devices',
      items: [
        {
          title: 'Local-first vaults',
          body: 'Stored on your device, works offline.'
        },
        {
          title: 'Master password and Secret Key',
          body: 'Both are required to unlock.'
        },
        {
          title: 'End-to-end encrypted sync',
          body: 'Servers only store ciphertext.'
        },
        {
          title: 'Self-hostable sync server',
          body: 'You keep full control of your data.'
        }
      ]
    },
    securitySection: {
      eyebrow: 'Security architecture',
      title: 'Only your devices can read your passwords',
      intro: 'Master password + Secret Key, Argon2id derivation, AES-256-GCM encryption — servers only see ciphertext.',
      points: [
        {
          title: 'Master password + Secret Key',
          body: 'Both derive the unlock key — neither works alone.'
        },
        {
          title: 'Argon2id key derivation',
          body: 'Makes offline password guessing far more expensive.'
        },
        {
          title: 'AES-256-GCM encryption',
          body: 'Items and attachments encrypt and decrypt locally.'
        },
        {
          title: 'Zero plaintext upload',
          body: 'Servers never see decryptable plaintext.'
        }
      ],
      diagram: {
        master: 'Master password',
        secret: 'Secret Key',
        kdf: 'Argon2id',
        unlockKey: 'unlockKey',
        wrap: 'AES-256-GCM wrap',
        vaultKey: 'vaultKey',
        wrapped: 'wrappedVaultKey (ciphertext only)',
        storage: 'Local store & server',
        note: 'The server can never read plaintext'
      }
    },
    downloadSection: {
      eyebrow: 'Downloads',
      title: 'All downloads',
      intro: 'Pick the installer for your Windows.',
      download: 'Download',
      loading: 'Loading...',
      unavailable: 'Unavailable',
      recommended: 'Recommended',
      groups: {
        windows: 'Windows'
      },
      platforms: {
        windowsX64: 'Windows (64-bit)'
      }
    },
    workflowSection: {
      eyebrow: 'Workflow',
      title: 'Four steps to get started',
      steps: [
        {
          title: 'Install the desktop app',
          body: 'Download and install in one go.'
        },
        {
          title: 'Create a local identity',
          body: 'Set a master password, generate a Secret Key.'
        },
        {
          title: 'Create vaults and items',
          body: 'Add logins, notes, cards, and more.'
        },
        {
          title: 'Connect a sync server',
          body: 'Sign in and bind your device.'
        }
      ]
    },
    serverSection: {
      eyebrow: 'Sync server',
      title: 'Official and self-hosted servers use one binding flow',
      body: 'Email, SMS, OAuth, or self-hosted — all share the same binding flow.'
    },
    faqSection: {
      eyebrow: 'FAQ',
      title: 'Three things to know before you start',
      items: [
        {
          question: 'Can the server see my passwords?',
          answer: 'No. Servers only store ciphertext; plaintext decrypts on your device.'
        },
        {
          question: 'Can I use it without a sync server?',
          answer: 'Yes. Vaults work offline; sync is an optional enhancement.'
        },
        {
          question: 'How is a Secret Key different from the master password?',
          answer: 'The master password unlocks daily; the Secret Key recovers new devices.'
        }
      ]
    },
    footer: {
      product: 'LockPass',
      tagline: 'Local-first, end-to-end encrypted, self-hostable.',
      supportQqLabel: 'Support QQ',
      copyright: 'LockPass Next project',
      privacy: 'Privacy Policy'
    }
  }
} as const
