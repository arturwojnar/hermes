[![Build and test](https://github.com/arturwojnar/hermes/actions/workflows/build-and-test.yaml/badge.svg?branch=main)](https://github.com/arturwojnar/hermes/actions/workflows/build-and-test.yaml)
[![Deploy VitePress site to Pages](https://github.com/arturwojnar/hermes/actions/workflows/publish-docs.yaml/badge.svg)](https://github.com/arturwojnar/hermes/actions/workflows/publish-docs.yaml)
[![Publish to NPM](https://github.com/arturwojnar/hermes/actions/workflows/publish.yaml/badge.svg)](https://github.com/arturwojnar/hermes/actions/workflows/publish.yaml)

<img src="./docs/public/logo-main.png" alt="Hermes logo" style="margin: 0 auto; width: 70%; display: block;" />
<br />
<br />

# Hermes

**Production-ready outbox pattern in TypeScript**

---

## 🌿What is _Hermes_?

📜*Hermes is the god of reliable deliveries. His two insignias are an outbox and a letter. Just write a message, put it into an envoy, and put it in the box. That's it! You don't need prayers, keeping crossed fingers and hope. Your message will be delivered for sure! Hermes is on it!*

---

_Hermes_ is a production-ready implementation of the [Outbox Pattern](https://microservices.io/patterns/data/transactional-outbox.html).\
Use it to provide [at-least-once delivery](https://microservices.io/patterns/communication-style/idempotent-consumer.html) to your system's consumers, so depite a timeout or a message broker outage, Hermes will keep trying to deliver that message to the broker.\
After Chris Richardson:

> At-least once delivery guarantees that a message broker will deliver a message to a consumer even if errors occur. One side-effect, however, is that the consumer can be invoked repeatedly for the same message

The Outbox pattern makes an atomic operation from a database operation (e.g. modifying an Aggregate or Entity) and publishing an event thanks to the fact that the event publishing happens first in the database along with the operation. Later Hermes makes sure that event goes to the message broker.

---

## ⚙️ Install

If you work with **PostgreSQL**, then:

```bash
npm i @arturwojnar/hermes @arturwojnar/hermes-postgresql
```

If you work with **MongoDB**, then:

```bash
npm i @arturwojnar/hermes @arturwojnar/hermes-mongodb
```

## 📌 Examples

You can try out the examples.

```bash
npm run run:postgresql-example
```

or

```bash
npm run run:mongodb-example
```

## 📁 Docs

Visit **Hermes** [docs](https://docs.hermesjs.tech/).

## 💬 Discussions

Head over to the [discussions](https://github.com/arturwojnar/hermes/discussions) to share your ideas.

## 🤝 Thanks

Special thanks to [Magdalena Gańczorz](https://www.linkedin.com/in/magdalena-ga%C5%84czorz-248bb6165/) for helping me with **Hermes** logo.

## Join the Discord

You can join the community of **Hermes-PostgreSQL** at [Discrod](https://discord.gg/EmMj58mu).
