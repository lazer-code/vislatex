/** @type {import('next').NextConfig} */
const MonacoWebpackPlugin = require('monaco-editor-webpack-plugin')

const nextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.plugins.push(
        new MonacoWebpackPlugin({
          languages: ['plaintext', 'latex'],
          filename: 'static/[name].worker.js',
        })
      )
    }
    return config
  },
}

module.exports = nextConfig
