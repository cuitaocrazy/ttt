namespace saga {
  const doneScript = `
  local subKey = KEYS[1]
  local rInfoKey = "${sagaInfoRunningPrefix}" .. subKey
  local dInfoKey = "${sagaInfoDonePrefix}" .. subKey
  local rEventKey = "${sagaEventLogRunningPrefix}" .. subKey
  local dEventKey = "${sagaEventLogDonePrefix}" .. subKey

  local infoJson = redis.call('get', rInfoKey)
  if infoJson then
    local info = cjson.decode(infoJson)
    info.status = 'done'

    if not info.retStatus then
      info.ret = cjson.decode(ARGV[1])
      info.retStatus = 'success'
    end
    
    redis.call('set', rInfoKey, cjson.encode(info))
  end
  
  pcall(redis.call, 'rename', rInfoKey, dInfoKey)
  pcall(redis.call, 'rename', rEventKey, dEventKey)
`

  const rollbackScript = `
  local subKey = KEYS[1]

  local rInfoKey = "${sagaInfoRunningPrefix}" .. subKey

  local infoJson = redis.call('get', rInfoKey)
  if infoJson then
    local info = cjson.decode(infoJson)
    info.status = 'rollbacking'
    info.ret = cjson.decode(ARGV[1])
    info.retStatus = 'fail'
    redis.call('set', rInfoKey, cjson.encode(info))
  end
`

  const discardScript = `
  local subKey = KEYS[1]

  local rInfoKey = "${sagaInfoRunningPrefix}" .. subKey
  local eInfoKey = "${sagaInfoErrorPrefix}" .. subKey
  local rEventKey = "${sagaEventLogRunningPrefix}" .. subKey
  local eEventKey = "${sagaEventLogErrorPrefix}" .. subKey

  pcall(redis.call, 'rename', rInfoKey, eInfoKey)
  pcall(redis.call, 'rename', rEventKey, eEventKey)
`

  const getSagaInfoScript = `
  local subKey = KEYS[1]

  local rInfoKey = "${sagaInfoRunningPrefix}" .. subKey
  local dInfoKey = "${sagaInfoDonePrefix}" .. subKey

  local infoJson = redis.call('get', rInfoKey)
  if not infoJson then
    infoJson = redis.call('get', dInfoKey)
  end

  return infoJson
`

  export class RedisSagaHistory implements SagaHistory {
    // eslint-disable-next-line no-useless-constructor
    constructor(private readonly redis: RedisClient) {}

    getSagaId(sagaName: string, payload: CmdPayload): string {
      return payload.id
    }

    async *getEventLogs(
      sagaName: string,
      id: string,
    ): AsyncGenerator<EventLog, any, unknown> {
      const jsonEventLogs = await this.redis.lrange(
        runningEventKey(sagaName, id),
        0,
        -1,
      )

      for (const jsonEventLog of jsonEventLogs) {
        const eventLog = JSON.parse(jsonEventLog, (k, v) => {
          if (k === 'ex') {
            return objToError(v)
          }

          return v
        })

        yield eventLog
      }
    }

    getAllIds(sagaName: string): Promise<string[]> {
      return this.redis
        .keys(runningInfoKey(sagaName, '*'))
        .then((keys) => keys.map((key) => key.split(':')[3]))
    }

    async getSagaInfo(sagaName: string, id: string): Promise<SagaInfoRet> {
      const infoJson = (await this.redis.eval(getSagaInfoScript, 1, getHashTag(sagaName, id))) as string | null

      if (infoJson) {
        return JSON.parse(infoJson, (k, v) => {
          if (k === 'ret') {
            return objToError(v)
          }

          if (k === 'createTime') {
            return new Date(v)
          }
          return v
        })
      }
    }

    async saveSagaInfo(
      sagaName: string,
      id: string,
      payload: CmdPayload,
    ): Promise<SagaInfo> {
      const infoJson: SagaInfo = {
        createTime: new Date(),
        id,
        payload,
        status: 'running',
      }

      // 确保写入
      // 当redis是cluster时, 可能会出现写入成功, 但master down了, 切换后数据丢失的情况
      // 对于saveSagaInfo, 必须保证数据写入成功, 否则会丢失CmdPayload, 当Saga重新load, 会导致无法恢复Saga.
      // 如果eventLog丢失, 当Saga重新load, 会导致saga执行失败(stepIndex不一致),
      // 转到错误记录里(discardDamagedSaga), 可以手动恢复, 因此不需要保证数据写入成功.
      // 当极端情况下, 整个redis cluster都不可访问, 这时本服务也挂了, 如果Cmd是由kafka发生, 则不会出现问题,
      // 因为这时saveSagaInfo是Saga run的一部分, 它会等待saveSagaInfo成功后才进行迭代下一个Cmd. 在等待期间, kafka不会提交这个Cmd或这一批Cmd.
      // 当系统重新启动后, 继续读这一个或一批(run 幂等, 可重复执行)Cmd重新执行Saga, 可保证CmdPayload不丢失. 因此这里不做其他持久处理.
      // ref: https://redis.io/docs/reference/cluster-spec/
      while (true) {
        await this.redis.set(
          runningInfoKey(sagaName, id),
          JSON.stringify(infoJson),
        )
        const ret = await this.redis.exists(runningInfoKey(sagaName, id))

        if (ret === 1) {
          break
        }
      }

      return infoJson
    }

    async saveEventLog(
      sagaName: string,
      id: string,
      log: EventLog,
    ): Promise<void> {
      await this.redis.rpush(runningEventKey(sagaName, id), JSON.stringify(log))
    }

    async done(sagaName: string, id: string, ret?: any): Promise<void> {
      await this.redis.eval(doneScript, 1, getHashTag(sagaName, id), JSON.stringify(ret))
    }

    async rollback(sagaName: string, id: string, ex: any): Promise<void> {
      await this.redis.eval(rollbackScript, 1, getHashTag(sagaName, id), JSON.stringify(ex))
    }

    async discardDamagedSaga(sagaName: string, id: string): Promise<void> {
      await this.redis
        .eval(discardScript, 1, getHashTag(sagaName, id))
        .catch((e) => {})
    }
  }
}
