import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'Hermes',
  description: 'Production-ready implementation of the Outbox Pattern in TypeScript',
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    logo: '/logo-main.png',
    nav: [
      { text: 'Home', link: '/' },
      { text: 'What is Hermes', link: '/pages/what-is-hermes' },
      {
        text: 'Release Notes',
        link: 'https://github.com/arturwojnar/hermes/releases',
      },
    ],

    sidebar: [
      {
        text: 'Examples',
        items: [
          { text: 'RabbitMQ Examples', link: '/pages/rabbitmq.md' },
          { text: 'Apache Pulsar Examples', link: '/pages/pulsar.md' },
        ],
      },
      {
        text: 'Others',
        items: [{ text: 'Useful links', link: '/pages/links.md' }],
      },
    ],

    socialLinks: [{ icon: 'github', link: 'https://github.com/arturwojnar/hermes' }],
    footer: {
      copyright: 'Copyright © Artur Wojnar and contributors.',
    },
  },
})
