# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [1.0.0-alpha.6](https://github.com/arturwojnar/hermes/compare/@arturwojnar/hermes-mongodb@1.0.0-alpha.5...@arturwojnar/hermes-mongodb@1.0.0-alpha.6) (2024-08-18)

**Note:** Version bump only for package @arturwojnar/hermes-mongodb

# 1.0.0-alpha.5 (2024-08-17)

# 1.0.0-alpha.3 (2024-04-05)

### Features

- new option `saveTimestamps` lets to attach sent timestamps to events that have been successfully sent ([45f3b9c](https://github.com/arturwojnar/hermes/commit/45f3b9c6a590889215f5a80ad75d36d81d72e129))

# 1.0.0-alpha.2 (2024-04-01)

### Bug Fixes

- fixed the build of hermes-mongodb to keep src files directly under the root build folder ([c3a372e](https://github.com/arturwojnar/hermes/commit/c3a372e4672c9e85d7881a415cc1a0464686c5ec))

# 1.0.0-alpha.1 (2024-03-25)

# 1.0.0-alpha.0 (2024-03-25)

### Bug Fixes

- removed MongoDB from the CJS build ([b6c8ac0](https://github.com/arturwojnar/hermes/commit/b6c8ac0c0cf30d6562a15a3cb391890a7223fffd))

### Features

- switching to monorepo ([62a629c](https://github.com/arturwojnar/hermes/commit/62a629cc6b8e3ce40e9d413355e5a6cf5044204a))

## [1.0.0-alpha.3](https://github.com/arturwojnar/hermes/compare/v1.0.0-alpha.2...v1.0.0-alpha.3) (2024-04-05)

### Features

- new option `saveTimestamps` lets to attach sent timestamps to events that have been successfully sent ([45f3b9c](https://github.com/arturwojnar/hermes/commit/45f3b9c6a590889215f5a80ad75d36d81d72e129))

## [1.0.0-alpha.2](https://github.com/arturwojnar/hermes/compare/v1.0.0-alpha.1...v1.0.0-alpha.2) (2024-04-01)

### Bug Fixes

- fixed the build of hermes-mongodb to keep src files directly under the root build folder ([c3a372e](https://github.com/arturwojnar/hermes/commit/c3a372e4672c9e85d7881a415cc1a0464686c5ec))

## [1.0.0-alpha.1](https://github.com/arturwojnar/hermes/compare/v1.0.0-alpha.0...v1.0.0-alpha.1) (2024-03-25)

## [1.0.0-alpha.0](https://github.com/arturwojnar/hermes/compare/a59313897e62e604bf00b8293d69c77b00f98dc7...v1.0.0-alpha.0) (2024-03-25)

### Features

- possibility to automatically add a callback on SIGTERM to release outbox consumer ([0883658](https://github.com/arturwojnar/hermes/commit/088365889b705404d4d83550532ca176a1887295))
- providing documentation ([a1fd348](https://github.com/arturwojnar/hermes/commit/a1fd348d45a23b0933c444619d1b5fd04da3463e))
- publishEvent accepts a callback + a test for partitioning ([79a1a0d](https://github.com/arturwojnar/hermes/commit/79a1a0da65c104d9e70b7fc6630fe6f5f6dbc30a))
- simplest version of the outbox pattern based on mongodb and its change events ([a593138](https://github.com/arturwojnar/hermes/commit/a59313897e62e604bf00b8293d69c77b00f98dc7))
- switching to monorepo ([62a629c](https://github.com/arturwojnar/hermes/commit/62a629cc6b8e3ce40e9d413355e5a6cf5044204a))

### Bug Fixes

- handling error by optional callbacks onDbError and onFailedPublish ([cc14afe](https://github.com/arturwojnar/hermes/commit/cc14afe8662daf0a60d3089452f5d98b637de5ba))
- removed MongoDB from the CJS build ([b6c8ac0](https://github.com/arturwojnar/hermes/commit/b6c8ac0c0cf30d6562a15a3cb391890a7223fffd))
