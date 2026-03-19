/**
 * electron-builder configuration for packaging VisLaTeX as a Windows desktop app.
 * Run `npm run dist` to produce a distributable installer in the `release/` folder.
 */
module.exports = {
  appId: 'com.lazer-code.vislatex',
  productName: 'VisLaTeX',
  copyright: 'Copyright © 2024 lazer-code',
  directories: {
    buildResources: 'resources',
    output: 'release',
  },
  files: [
    'out/**',
    'package.json',
  ],
  extraMetadata: {
    main: 'out/main/index.js',
  },
  win: {
    target: [
      { target: 'nsis', arch: ['x64', 'ia32'] },
      { target: 'portable', arch: ['x64'] },
    ],
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'VisLaTeX',
  },
  mac: {
    target: [{ target: 'dmg', arch: ['x64', 'arm64'] }],
    category: 'public.app-category.productivity',
  },
  linux: {
    target: [{ target: 'AppImage', arch: ['x64'] }],
    category: 'Education',
  },
}
