// https://semver.org/
const REGEXP =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/

export const parseSemVer = (value: string = '') => {
  const versions = REGEXP.exec(value)

  return {
    major: Number(versions?.[1]) || void 0,
    minor: Number(versions?.[2]) || void 0,
    bugfix: Number(versions?.[3]) || void 0,
    rc: versions?.[4] || void 0,
  }
}
