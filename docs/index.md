---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: 'Hermes'
  text: 'Production-Ready TypeScript Outbox Pattern'
  tagline: You don't need more prayers. Your messages will be delivered for sure!
  image:
    src: /logo-main.png
    alt: Hermes logo
  actions:
    - theme: brand
      text: Getting started
      link: /pages/getting-started.md
    - theme: alt
      text: Hermes MongoDB API
      link: https://hermes.arturwojnar.dev/hermes-mongodb/index.html
    - theme: alt
      text: Hermes PostreSQL API
      link: https://hermes.arturwojnar.dev/hermes-postgresql/index.html

features:
  - title: Optimized for large-scale🚀
    details: By default Hermes updates only a consumer to keep track of last processed event. Also, you can utilize partion keys to scale out your application
  - title: Message broker-agnostic🔌
    details: You can plug in a cloud-native solution, Apache Pulsar or RabbitMQ
  - title: Supports MongoDB's Change Streams🍃
    details: And PostreSQL integration is coming!
  - title: Fully covered by tests📑
    details: You may sleep well at night because Hermes features are well covered by tests
---

<br />

<div style="max-width: 600px;  text-align: justify; text-justify: inter-word; margin: 0 auto;">
<i>"Hermes is the god of reliable deliveries. His two insignias are an outbox and a letter. Just write a message, put it into an envoy, and put it in the box. That's it! You don't need prayers, keeping crossed fingers and hope. Your message will be delivered for sure! Hermes is on it!</i>
</div>

<div class="usedBy">
  <span class="trustedBy">Trusted by</span>
  
  <div class="clients">
    <a href="https://www.orikami.ai/" target="_blank" class="client" title="Orikami">
      <img src="./public/logo_orikami.svg" alt="Orikami Logo" class="orikami" />
    </a>
    <a href="https://revolve.healthcare/" target="_blank" class="client" title="Revolve Healthcare">
      <img src="./public/revolve_logo.svg" alt="Revolve Logo" class="revovle" />
    </a>
  </div>
</div>

<div class="badges">

[![Build and test](https://github.com/arturwojnar/hermes/actions/workflows/build-and-test.yaml/badge.svg?branch=main)](https://github.com/arturwojnar/hermes/actions/workflows/build-and-test.yaml)

[![Deploy VitePress site to Pages](https://github.com/arturwojnar/hermes/actions/workflows/publish-docs.yaml/badge.svg)](https://github.com/arturwojnar/hermes/actions/workflows/publish-docs.yaml)

[![Publish to NPM](https://github.com/arturwojnar/hermes/actions/workflows/publish.yaml/badge.svg)](https://github.com/arturwojnar/hermes/actions/workflows/publish.yaml)

</div>
