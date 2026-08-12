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
      workflow: '使用流程',
      download: '软件下载',
      guide: '使用说明',
      help: '帮助',
      language: 'English'
    },
    hero: {
      eyebrow: '桌面密码管理器',
      title: 'LockPass',
      subtitle:
        '本地优先保存保险库数据，使用主密码与安全密钥保护条目，并通过端到端加密同步连接多台受信任设备。',
      primaryCta: '下载 Windows 版',
      secondaryCta: '查看使用说明',
      versionPrefix: '当前版本',
      platformNote: 'Windows x64 安装包',
      trustItems: ['本地离线可用', '端到端加密同步', '支持自部署服务器']
    },
    featureSection: {
      eyebrow: '产品能力',
      title: '密码库明文只留在你的设备上',
      intro:
        'LockPass 把日常使用、备份、同步和恢复拆成清晰的边界。服务器只保存密文与必要元数据，桌面端负责解密和操作体验。',
      items: [
        {
          title: '本地优先保险库',
          body:
            '保险库、条目和附件默认保存在本机数据库中。没有网络时也可以查看和编辑，恢复联网后再同步。'
        },
        {
          title: '主密码与安全密钥',
          body:
            '主密码用于日常解锁，安全密钥用于新设备恢复和长期备份。受信任设备可把安全密钥保存到系统安全存储。'
        },
        {
          title: '端到端加密同步',
          body:
            '同步服务器只处理账号、设备、同步空间、版本和密文对象，不接触可解密的密码库明文。'
        },
        {
          title: '自部署同步服务',
          body:
            '个人或团队可以部署自己的同步服务器和 Web 后台，保留账号、设备、权限和同步数据的控制权。'
        }
      ]
    },
    screenshotSection: {
      eyebrow: '软件截图',
      title: '先看真实桌面端界面',
      intro:
        '截图来自当前桌面端浏览器预览，展示保险库条目列表、详情面板、设置、日志和安全选项等实际页面。',
      items: [
        {
          title: '保险库与条目详情',
          body: '左侧按保险库分组，中间是条目列表，右侧展示字段、密码强度和安全检查。'
        },
        {
          title: '设置与本机设备信息',
          body: '设置页集中管理当前用户、本机设备 ID、界面语言、日志级别和安全选项。'
        }
      ]
    },
    downloadSection: {
      eyebrow: '软件下载',
      title: '选择适合你的安装包',
      intro: '当前提供 Windows 64 位版本，后续平台会在这里继续增加。',
      download: '下载',
      loading: '正在读取...',
      unavailable: '暂不可用',
      recommended: '推荐',
      groups: {
        windows: 'Windows'
      },
      platforms: {
        windowsX64: 'Windows 64 位'
      }
    },
    workflowSection: {
      eyebrow: '使用流程',
      title: '从安装到同步，保持步骤清楚',
      steps: [
        {
          title: '安装桌面端',
          body:
            '下载 Windows 安装包并完成安装。首次打开时，应用会初始化本地数据库和必要的安全设置。'
        },
        {
          title: '创建本地身份',
          body:
            '设置主密码并生成安全密钥。请把安全密钥保存在安全位置，它是新设备恢复的重要凭据。'
        },
        {
          title: '建立保险库和条目',
          body:
            '创建保险库后添加登录、笔记、银行卡或附件等条目。条目内容会以密文形式保存在本机。'
        },
        {
          title: '连接同步服务器',
          body:
            '登录服务器账号后绑定当前设备。同步数据按账号、同步空间、保险库和对象分层保存。'
        },
        {
          title: '备份与恢复',
          body:
            '定期创建备份文件。恢复时选择备份文件并输入所需凭据，应用会引导你完成导入。'
        }
      ]
    },
    guideSection: {
      eyebrow: '使用说明',
      title: '推荐的第一套使用习惯',
      items: [
        '主密码只用于你本人记忆，不要和服务器登录密码混用。',
        '安全密钥离线保存一份，受信任设备可以额外保存到系统安全存储。',
        '每台设备绑定服务器账号后，后台设备列表会显示本机设备 ID、最近活动时间和最近 IP。',
        '同步失败或服务器数据被重置时，先检查服务器连接状态，再决定是否重新绑定设备。',
        '导入备份和手动同步前，留意进度弹窗与完成后的文件路径提示。'
      ]
    },
    serverSection: {
      eyebrow: '同步服务器',
      title: '官方服务和自部署使用同一套绑定逻辑',
      body:
        '桌面端只要登录成功就可以绑定设备。邮箱、短信、OAuth 或自部署入口都进入统一的账号和设备绑定流程。管理员可以查看全量同步数据汇总，普通用户只能查看自己账号下的数据。'
    },
    faqSection: {
      eyebrow: '常见问题',
      title: '开始使用前可以先确认这些边界',
      items: [
        {
          question: '服务器能看到我的密码吗？',
          answer:
            '不能。服务器保存的是密文对象、版本、设备和同步游标等数据，密码条目明文只在桌面端解密。'
        },
        {
          question: '不连接同步服务器可以用吗？',
          answer:
            '可以。LockPass 是本地优先应用，离线也能管理保险库。同步只是多设备使用时的增强能力。'
        },
        {
          question: '安全密钥和主密码有什么区别？',
          answer:
            '主密码用于日常解锁；安全密钥是高熵凭据，用于恢复保险库或在新设备上建立信任。'
        }
      ]
    },
    footer: {
      product: 'LockPass',
      tagline: '本地优先、端到端加密、可自部署的密码管理器。',
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
      workflow: 'Workflow',
      download: 'Download',
      guide: 'Guide',
      help: 'Help',
      language: '中文'
    },
    hero: {
      eyebrow: 'Desktop password manager',
      title: 'LockPass',
      subtitle:
        'Keep vault data local first, protect items with a master password and Secret Key, and sync trusted devices through end-to-end encryption.',
      primaryCta: 'Download for Windows',
      secondaryCta: 'Read the guide',
      versionPrefix: 'Current version',
      platformNote: 'Windows x64 installer',
      trustItems: ['Works offline', 'End-to-end encrypted sync', 'Self-hostable server']
    },
    featureSection: {
      eyebrow: 'Product',
      title: 'Plaintext vault data stays on your devices',
      intro:
        'LockPass keeps daily use, backups, sync, and recovery behind clear boundaries. The server stores ciphertext and required metadata; the desktop app handles decryption and the working experience.',
      items: [
        {
          title: 'Local-first vaults',
          body:
            'Vaults, items, and attachments are stored in a local database by default. You can work offline and sync after reconnecting.'
        },
        {
          title: 'Master password and Secret Key',
          body:
            'The master password unlocks day-to-day access. The Secret Key supports new-device recovery and long-term backup. Trusted devices can store it in OS secure storage.'
        },
        {
          title: 'End-to-end encrypted sync',
          body:
            'The sync server handles accounts, devices, sync spaces, versions, and encrypted objects without access to decryptable vault plaintext.'
        },
        {
          title: 'Self-hostable sync server',
          body:
            'Individuals or teams can run their own sync server and Web console while keeping control over accounts, devices, permissions, and sync data.'
        }
      ]
    },
    screenshotSection: {
      eyebrow: 'Screenshots',
      title: 'See the real desktop app first',
      intro:
        'These screenshots come from the current desktop browser preview and show the actual vault list, detail pane, settings, logging, and security options.',
      items: [
        {
          title: 'Vaults and item details',
          body: 'Vaults are grouped on the left, items sit in the middle, and fields, password strength, and security checks appear on the right.'
        },
        {
          title: 'Settings and local device info',
          body: 'The settings page manages the current user, local device ID, interface language, log level, and security options.'
        }
      ]
    },
    downloadSection: {
      eyebrow: 'Download',
      title: 'Choose your installer',
      intro: 'Windows x64 is available now. Additional platforms will appear here as they are released.',
      download: 'Download',
      loading: 'Loading...',
      unavailable: 'Unavailable',
      recommended: 'Recommended',
      groups: {
        windows: 'Windows'
      },
      platforms: {
        windowsX64: 'Windows x64'
      }
    },
    workflowSection: {
      eyebrow: 'Workflow',
      title: 'From install to sync, keep the steps explicit',
      steps: [
        {
          title: 'Install the desktop app',
          body:
            'Download the Windows installer and finish setup. On first launch, the app initializes the local database and required security settings.'
        },
        {
          title: 'Create a local identity',
          body:
            'Set a master password and generate a Secret Key. Store the Secret Key safely; it is important for new-device recovery.'
        },
        {
          title: 'Create vaults and items',
          body:
            'Create a vault, then add logins, notes, cards, or attachments. Item contents are stored locally as ciphertext.'
        },
        {
          title: 'Connect a sync server',
          body:
            'Sign in to a server account and bind the current device. Sync data is organized by account, sync space, vault, and object.'
        },
        {
          title: 'Back up and recover',
          body:
            'Create backup files regularly. During recovery, choose the backup file and provide the required credentials as the app guides the import.'
        }
      ]
    },
    guideSection: {
      eyebrow: 'Guide',
      title: 'A good first operating habit',
      items: [
        'Use the master password only for local vault unlock, not as your server login password.',
        'Keep one offline copy of the Secret Key; trusted devices can also store it in OS secure storage.',
        'After binding a server account, the device list shows the local device ID, last activity time, and recent IP.',
        'If sync fails after a server reset, check the server connection state before rebinding the device.',
        'Before importing backups or manual sync, watch the progress dialog and the file path shown after completion.'
      ]
    },
    serverSection: {
      eyebrow: 'Sync server',
      title: 'Official and self-hosted servers use one binding flow',
      body:
        'The desktop app can bind a device after any successful login. Email, SMS, OAuth, and self-hosted entry points share the same account and device-binding flow. Admins can inspect global sync summaries, while regular users can only view data under their own account.'
    },
    faqSection: {
      eyebrow: 'FAQ',
      title: 'Confirm the boundaries before you start',
      items: [
        {
          question: 'Can the server see my passwords?',
          answer:
            'No. The server stores encrypted objects, revisions, devices, and sync cursors. Password item plaintext is decrypted only in the desktop app.'
        },
        {
          question: 'Can I use it without a sync server?',
          answer:
            'Yes. LockPass is local-first, so you can manage vaults offline. Sync is an enhancement for multi-device use.'
        },
        {
          question: 'How is a Secret Key different from the master password?',
          answer:
            'The master password unlocks daily access. The Secret Key is a high-entropy credential used to recover vaults or establish trust on a new device.'
        }
      ]
    },
    footer: {
      product: 'LockPass',
      tagline: 'A local-first, end-to-end encrypted, self-hostable password manager.',
      copyright: 'LockPass Next project',
      privacy: 'Privacy Policy'
    }
  }
} as const
