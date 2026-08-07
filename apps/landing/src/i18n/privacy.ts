import type { Locale } from './index'

interface PrivacySection {
  id: string
  title: string
  paragraphs?: string[]
  items?: string[]
}

interface PrivacyMessages {
  meta: {
    title: string
    description: string
  }
  eyebrow: string
  title: string
  titleProduct: string
  titleSubject: string
  summary: string
  effectiveDateLabel: string
  effectiveDate: string
  backHome: string
  language: string
  sections: PrivacySection[]
  contact: {
    title: string
    body: string
    linkLabel: string
    warning: string
  }
}

export const privacyContactHref = 'https://github.com/ftyszyx/lockpass-next/issues'

export const privacyMessages: Record<Locale, PrivacyMessages> = {
  'zh-CN': {
    meta: {
      title: 'LockPass 隐私政策',
      description: '了解 LockPass 桌面端、Web 客户端、浏览器扩展和同步服务如何处理与保护用户数据。'
    },
    eyebrow: '隐私与数据保护',
    title: 'LockPass 隐私政策',
    titleProduct: 'LockPass',
    titleSubject: '隐私政策',
    summary:
      'LockPass 是本地优先、端到端加密的密码管理器。我们只处理提供账号、设备绑定、保险库管理、网页填充和加密同步所必需的数据。',
    effectiveDateLabel: '生效日期',
    effectiveDate: '2026 年 8 月 7 日',
    backHome: '返回首页',
    language: 'English',
    sections: [
      {
        id: 'scope',
        title: '1. 适用范围',
        paragraphs: [
          '本政策适用于 LockPass 桌面端、Web 客户端、浏览器扩展、官网以及由 LockPass 项目运营的官方同步服务。',
          '如果你连接的是自建服务器，该服务器的运营者将独立决定服务器日志、账号数据和密文数据的保存方式。LockPass 客户端仍按照本政策描述的方式在本机处理数据。'
        ]
      },
      {
        id: 'data',
        title: '2. 我们处理的数据',
        items: [
          '账号信息：邮箱、显示名称、账号 ID，以及邮箱验证码挑战所需的状态和安全元数据。',
          '身份验证与保险库数据：用户名、密码、一次性密码、恢复代码、安全笔记、身份信息、银行卡信息、网站地址、附件和用户创建的其它条目内容。',
          '设备与安全信息：设备 ID、设备名称、设备类型、授权令牌、最近活动时间、IP 地址和必要的安全日志。',
          '网页填充信息：当前网页的 origin、用户保存在条目中的网站地址，以及用于识别登录框的输入类型、名称、标签和 autocomplete 等表单结构信息。',
          '设置与会话信息：界面语言、主题、服务器地址、当前保险库选择、解锁状态和同步状态。',
          '加密同步数据：保险库对象、附件、版本、同步游标和必要元数据的端到端加密密文。'
        ]
      },
      {
        id: 'local-processing',
        title: '3. 本地处理与服务器边界',
        items: [
          '主密码不会被保存，也不会发送给 LockPass 同步服务器。',
          '安全密钥仅由用户保存，或使用浏览器、操作系统提供的本地安全能力加密保存；不会作为可读明文上传到同步服务器。',
          '保险库条目在客户端加密后再同步。官方同步服务器处理账号、设备、版本、密文对象和必要同步元数据，不能直接读取保险库明文。',
          '浏览器扩展在本机使用当前网页 origin 匹配登录条目。当前页面的完整 URL、页面正文、Cookie 和网络请求不会发送给 LockPass 同步服务器。',
          '网页内容脚本只在用户授权的网站运行，并仅处理识别登录输入框和执行用户请求的填充所需的信息。'
        ]
      },
      {
        id: 'use',
        title: '4. 数据用途',
        items: [
          '创建和验证服务器账号，绑定、识别和撤销受信任设备。',
          '在设备本地创建、查看、编辑、搜索、生成和填充保险库条目。',
          '执行端到端加密同步、冲突处理、备份恢复和离线状态恢复。',
          '保护账号和同步服务，诊断错误并防止滥用。',
          '保存用户选择的语言、主题、服务器和权限设置。'
        ]
      },
      {
        id: 'sharing',
        title: '5. 数据共享与出售',
        paragraphs: [
          '我们不会出售用户数据，不会将数据用于广告画像、信用评估、贷款决策或与 LockPass 单一用途无关的用途。',
          '运营官方服务时，我们可能使用提供托管、对象存储、邮件发送和安全防护的服务商。这些服务商只能为提供相应服务处理必要数据。法律要求、保护用户安全或处理安全事件时，我们也可能依法披露最少必要信息。'
        ]
      },
      {
        id: 'storage-security',
        title: '6. 存储与安全',
        items: [
          '本地设置保存在应用配置、浏览器扩展存储或本地数据库中。卸载应用或清除扩展数据会删除相应设备上的本地数据。',
          '设备令牌和受信任设备保存的安全密钥使用本地生成的不可导出密钥和 AES-GCM 加密保存。',
          '已解锁的保险库密钥和明文条目只在当前受信任客户端会话中使用，并在锁定、会话失效或应用退出时清理。',
          '网络通信应使用 HTTPS。自建服务器运营者负责正确配置传输安全、访问控制、备份和日志保留。'
        ]
      },
      {
        id: 'retention',
        title: '7. 保留、删除与用户选择',
        items: [
          '本地数据会保留到用户删除账号的本地数据、清除浏览器扩展数据或卸载客户端。',
          '官方服务器上的账号、设备、密文和同步元数据会保留到用户或服务运营者执行删除；安全备份可能在有限时间内继续存在。',
          '用户可以撤销网页访问权限、锁定保险库、移除设备或改用自建服务器。撤销网页权限后，浏览器扩展不会继续在未授权网站运行。',
          '自建服务器上的数据删除和保留请求应提交给对应服务器运营者。'
        ]
      },
      {
        id: 'chrome',
        title: '8. Chrome Web Store 有限使用声明',
        paragraphs: [
          'LockPass 对从 Google API 或 Chrome 扩展 API 获得的信息的使用，遵守 Chrome Web Store 用户数据政策，包括有限使用要求。',
          '浏览器扩展处理的数据仅用于账号授权、保险库管理、凭据生成与填充、设备安全和加密同步，不会用于广告、用户画像或无关的数据分析。'
        ]
      },
      {
        id: 'changes',
        title: '9. 政策更新',
        paragraphs: [
          '当产品功能、数据处理方式或法律要求发生变化时，我们可能更新本政策。新版本会在本页面公布并更新生效日期。重大变化会通过合理方式提示用户。'
        ]
      }
    ],
    contact: {
      title: '10. 联系我们',
      body: '如需咨询隐私、数据删除或安全问题，可以通过 LockPass 项目问题反馈页面联系维护者。自建服务器相关请求请联系该服务器的运营者。',
      linkLabel: '打开问题反馈页面',
      warning: '请勿在公开问题中提交密码、安全密钥、验证码或其它保险库敏感信息。'
    }
  },
  'en-US': {
    meta: {
      title: 'LockPass Privacy Policy',
      description: 'Learn how LockPass desktop, web, browser extension, and sync services process and protect user data.'
    },
    eyebrow: 'Privacy and data protection',
    title: 'LockPass Privacy Policy',
    titleProduct: 'LockPass',
    titleSubject: 'Privacy Policy',
    summary:
      'LockPass is a local-first, end-to-end encrypted password manager. We process only the data needed to provide accounts, device authorization, vault management, browser filling, and encrypted sync.',
    effectiveDateLabel: 'Effective date',
    effectiveDate: 'August 7, 2026',
    backHome: 'Back to home',
    language: '中文',
    sections: [
      {
        id: 'scope',
        title: '1. Scope',
        paragraphs: [
          'This policy applies to the LockPass desktop app, web client, browser extension, website, and official sync services operated by the LockPass project.',
          'When you connect to a self-hosted server, that server operator independently determines how server logs, account data, and encrypted data are retained. LockPass clients continue to process local data as described in this policy.'
        ]
      },
      {
        id: 'data',
        title: '2. Data we process',
        items: [
          'Account information: email address, display name, account ID, and state and security metadata required for email verification challenges.',
          'Authentication and vault data: usernames, passwords, one-time passwords, recovery codes, secure notes, identity information, payment card information, website addresses, attachments, and other item content created by the user.',
          'Device and security information: device ID, device name, device type, authorization tokens, recent activity time, IP address, and necessary security logs.',
          'Browser filling information: the current page origin, website addresses saved in items, and form structure such as input types, names, labels, and autocomplete attributes used to identify login fields.',
          'Settings and session information: interface language, theme, server address, current vault selection, unlock state, and sync state.',
          'Encrypted sync data: end-to-end encrypted vault objects, attachments, revisions, sync cursors, and required metadata.'
        ]
      },
      {
        id: 'local-processing',
        title: '3. Local processing and server boundaries',
        items: [
          'The master password is not stored and is not sent to the LockPass sync server.',
          'The Secret Key is retained by the user or encrypted with local browser or operating-system security capabilities. It is not uploaded to the sync server as readable plaintext.',
          'Vault items are encrypted on the client before sync. The official sync server processes accounts, devices, revisions, encrypted objects, and required sync metadata, but cannot directly read vault plaintext.',
          'The browser extension matches login items against the current page origin locally. The complete page URL, page body, cookies, and network requests are not sent to the LockPass sync server.',
          'Content scripts run only on websites authorized by the user and process only the information needed to identify login inputs and perform user-requested filling.'
        ]
      },
      {
        id: 'use',
        title: '4. How we use data',
        items: [
          'Create and verify server accounts and bind, identify, and revoke trusted devices.',
          'Create, view, edit, search, generate, and fill vault items on the user’s device.',
          'Provide end-to-end encrypted sync, conflict handling, backup recovery, and offline recovery.',
          'Protect accounts and sync services, diagnose errors, and prevent abuse.',
          'Remember the user’s language, theme, server, and permission choices.'
        ]
      },
      {
        id: 'sharing',
        title: '5. Sharing and sale of data',
        paragraphs: [
          'We do not sell user data or use it for advertising profiles, creditworthiness, lending decisions, or purposes unrelated to LockPass’s single purpose.',
          'To operate official services, we may use providers for hosting, object storage, email delivery, and security protection. They may process only the data necessary to provide those services. We may also disclose the minimum information required by law or necessary to protect users and respond to security incidents.'
        ]
      },
      {
        id: 'storage-security',
        title: '6. Storage and security',
        items: [
          'Local settings are stored in application configuration, browser extension storage, or local databases. Uninstalling a client or clearing extension data removes the corresponding local data from that device.',
          'Device tokens and Secret Keys retained by trusted devices are encrypted with locally generated, non-exportable keys and AES-GCM.',
          'Unlocked vault keys and plaintext items are used only in the current trusted-client session and are cleared when the vault locks, the session expires, or the application exits.',
          'Network communication should use HTTPS. Self-hosted server operators are responsible for transport security, access controls, backups, and log retention.'
        ]
      },
      {
        id: 'retention',
        title: '7. Retention, deletion, and user choices',
        items: [
          'Local data remains until the user removes local account data, clears browser extension data, or uninstalls the client.',
          'Accounts, devices, encrypted objects, and sync metadata on official servers remain until deletion is performed by the user or service operator. Security backups may remain for a limited period.',
          'Users can revoke website access, lock the vault, remove devices, or switch to a self-hosted server. After website access is revoked, the extension no longer runs on unauthorized websites.',
          'Requests concerning data on a self-hosted server must be directed to that server’s operator.'
        ]
      },
      {
        id: 'chrome',
        title: '8. Chrome Web Store Limited Use disclosure',
        paragraphs: [
          'The use of information received from Google APIs or Chrome extension APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.',
          'Data handled by the browser extension is used only for account authorization, vault management, credential generation and filling, device security, and encrypted sync. It is not used for advertising, user profiling, or unrelated analytics.'
        ]
      },
      {
        id: 'changes',
        title: '9. Changes to this policy',
        paragraphs: [
          'We may update this policy when product features, data practices, or legal requirements change. The updated version will be posted on this page with a revised effective date. Material changes will be communicated through reasonable means.'
        ]
      }
    ],
    contact: {
      title: '10. Contact us',
      body: 'For privacy, deletion, or security questions, contact the maintainers through the LockPass project issue tracker. Requests concerning a self-hosted server should be sent to that server’s operator.',
      linkLabel: 'Open the issue tracker',
      warning: 'Do not include passwords, Secret Keys, verification codes, or other sensitive vault information in a public issue.'
    }
  }
}
