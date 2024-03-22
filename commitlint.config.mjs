export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'body-max-line-length': [0],
    'footer-max-line-length': [0, 'always'],
    'header-max-length': [2, 'always', 150],
  },
}
