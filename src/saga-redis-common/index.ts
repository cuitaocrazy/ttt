namespace saga {
  type RedisClientType = import('ioredis').default

  // const a: RedisClientType = null
  // a.llen
  export type RedisClient = Pick<
    RedisClientType,
    | 'llen'
    | 'lrange'
    | 'keys'
    | 'set'
    | 'get'
    | 'exists'
    | 'eval'
    | 'rpush'
    | 'sadd'
    | 'srem'
    | 'multi'
    | 'sismember'
  >

  export type ChannelClient = Pick<
    RedisClientType,
    'subscribe' | 'pubsub' | 'on'
  >

  export const sagaInfoRunningPrefix = 'r:i:'
  export const sagaInfoDonePrefix = 'd:i:'
  export const sagaInfoErrorPrefix = 'e:i:'
  export const sagaEventLogRunningPrefix = 'r:e:'
  export const sagaEventLogDonePrefix = 'd:e:'
  export const sagaEventLogErrorPrefix = 'e:e:'

  export function runningInfoKey(sagaName: string, id: string) {
    return `${sagaInfoRunningPrefix}{${sagaName}:${id}}`
  }

  export function runningEventKey(sagaName: string, id: string) {
    return `${sagaEventLogRunningPrefix}${getHashTag(sagaName, id)}`
  }

  export function doneInfoKey(sagaName: string, id: string) {
    return `${sagaInfoDonePrefix}${getHashTag(sagaName, id)}`
  }

  export function doneEventKey(sagaName: string, id: string) {
    return `${sagaEventLogDonePrefix}${getHashTag(sagaName, id)}`
  }

  export function errInfoKey(sagaName: string, id: string) {
    return `${sagaInfoErrorPrefix}${getHashTag(sagaName, id)}`
  }

  export function errEventKey(sagaName: string, id: string) {
    return `${sagaEventLogErrorPrefix}${getHashTag(sagaName, id)}`
  }

  export function getHashTag(sagaName: string, id: string) {
    return `{${sagaName}:${id}}`
  }
}
