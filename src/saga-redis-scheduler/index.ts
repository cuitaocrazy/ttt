namespace saga {
  const randomUUID: typeof import('crypto').randomUUID =
    require('crypto').randomUUID
  const prefix = '{scheduler}:'

  const allKey = prefix + 'all'

  type TriggerLoad = () => void

  export function makeTriggerLoad(
    redisClient: RedisClient,
    batchSize: number,
  ): TriggerLoad {
    // 算法说明:
    // 每一个channel都有正在处理saga的个数, 按从小到大排序: channelMsgs
    // 在allKey中提取出没有处理的saga: loadKeys
    // 目标是把这些没有处理的saga平均分配到各个channel中: channels
    //
    // 设定两个游标_current, _next指向channelMsgs中的两个相邻的元素
    // 这两个元素可组合成3中情况:
    // 1. 左大右小
    // 2. 相等
    // 3. 左小右大
    // 情况1, 2, 3都能保证左边的所有元素都和_current的大小相等
    // 那么当出现情况1时, 就把元素分配给右边_next, 然后两个游标都向右移动
    // 当出现情况2/3时, 就把元素分配给第一个元素, 在从第一个元素开始重新平衡
    //
    // 当_current是最后一个元素时, 确保_next指向第一个元素(适用于channelMsgs只有一个元素的情况)
    //
    const script = `
local tempChannelSetKey = KEYS[1] .. 'channels'
local tempSetKey = KEYS[1] .. 'sets'
local tempCurrentChannelAllKey = KEYS[1] .. 'current'
local allKey = KEYS[1] .. 'all'
local channelKeyFilter = KEYS[1] .. '*'

redis.call('del', tempChannelSetKey, tempSetKey, tempCurrentChannelAllKey)
local sets = redis.call('keys', KEYS[1] .. '*')

if #sets > 0 then
  redis.call('sadd', tempSetKey, unpack(sets))
end
redis.call('srem', tempSetKey, allKey)

local channels = redis.call('pubsub', 'channels', channelKeyFilter)

if #channels == 0 then
  return
end

redis.call('sadd', tempChannelSetKey, unpack(channels))

local diffChannels = redis.call('sdiff', tempSetKey, tempChannelSetKey)

if #diffChannels > 0 then
  redis.call('del', unpack(diffChannels))
end

redis.call('sunionstore', tempCurrentChannelAllKey, unpack(channels))

local loadKeys = redis.call('sdiff', allKey, tempCurrentChannelAllKey)

local channelMsgs = {}

for i = 1, #channels do
  channelMsgs[i] = {redis.call('scard', channels[i]), {}, i}
end

table.sort(channelMsgs, function(a, b) return a[1] < b[1] end)

local loadCount = ${batchSize}

if #loadKeys > 0 and #channelMsgs > 0 then
  local _current = 1
  local _next = _current % #channelMsgs + 1
  local count = (loadCount < #loadKeys) and loadCount or #loadKeys

  for i = 1, count do
    local key = loadKeys[i]
    local c_channel = channelMsgs[_current]
    local n_channel = channelMsgs[_next]
    local channel

    if c_channel[1] <= n_channel[1] then
      channel = channelMsgs[1]
      _current = 1
    else
      channel = n_channel
      _current = _next
    end

    _next = _current % #channelMsgs + 1

    channel[1] = channel[1] + 1
    channel[2][#channel[2] + 1] = key
    
  end
end

for _, v in ipairs(channelMsgs) do
  if #v[2] > 0 then
    redis.call('sadd', channels[v[3]], unpack(v[2]))
    redis.call('publish', channels[v[3]], cjson.encode(v[2]))
  end
end

redis.call('del', tempChannelSetKey, tempSetKey, tempCurrentChannelAllKey)
  `

    return () => {
      redisClient.eval(script, 1, prefix)
    }
  }

  // https://redis.io/docs/manual/pubsub/
  // redis的channel client需要和其他client分开, channel client只能允许的操作是
  // `SUBSCRIBE`, `SSUBSCRIBE`, `SUNSUBSCRIBE`, `PSUBSCRIBE`, `UNSUBSCRIBE`, `PUNSUBSCRIBE`, `PING`, `RESET`, 和 `QUIT`
  export function createRedisSagaScheduler(
    redisClient: RedisClient,
    channelClient: ChannelClient,
    sagas: { [key: string]: Saga | undefined },
    cmdIter: AsyncGenerator<Cmd, void>,
    maxSagaInstanceCount: number = 0,
    batchSize: number = 100,
  ): SagaScheduler {
    const key = prefix + randomUUID()

    const triggerLoad = makeTriggerLoad(redisClient, batchSize)

    Object.values(sagas).forEach((saga) => {
      saga?.registoryInstanceDoneCallback(async (name, id) => {
        const rik = runningInfoKey(name, id)

        const script = `
        local channelFilter = KEYS[1] .. '*'
        local channels = redis.call('pubsub', 'channels', channelFilter)

        redis.call('srem', ${allKey}, ${rik})

        for _, channel in ipairs(channels) do
          redis.call('srem', channel, ${rik})
        end
        `

        await redisClient.eval(script, 1, prefix)
      })
    })

    async function* cmdIterHook() {
      const script = (id: string) => `
      local key = ${key}

      local channels = redis.call('pubsub', 'channels', KEYS[1] .. '*')

      local isNew = redis.call('sismember', ${allKey}, ${id}) == 0

      if isNew then
        redis.call('sadd', ${allKey}, ${id})
        redis.call('sadd', ${allKey}, ${id})
        return 'new'
      else
        local thisChannelExists = redis.call('sismember', key, ${id}) == 1
        if thisChannelExists then
          return 'exists'
        else
          local otherChannelExists = false
          for _, channel in ipairs(channels) do
            otherChannelExists = redis.call('sismember', channel, ${id}) == 1
            if otherChannelExists then
              break
            end
          end

          if otherChannelExists then
            return 'assigned'
          else
            redis.call('sadd', key, ${id})
            return 'newAssignment'
          end
        end
      end
    `

      for await (const cmd of cmdIter) {
        const name = cmd.type
        const id = cmd.payload.id
        const saga = sagas[name]

        if (!saga) {
          continue
        }

        if (saga.existsInstance(cmd.payload.id)) {
          continue
        }

        const sagaInfoRet = await saga.getRepo().getSagaInfo(name, id)

        const rik = runningInfoKey(cmd.type, cmd.payload.id)

        if (sagaInfoRet && sagaInfoRet.status === 'done') {
          const exists = await redisClient.sismember(allKey, rik)

          if (exists) {
            // 如果saga已经完成, 但是还在redis中, 让saga触发done事件来清理redis中的数据
            saga.load(sagaInfoRet)
          }

          continue
        }

        const scriptRet = await redisClient.eval(script(rik), 1, prefix)

        // 两个返回组成8种情况, 最正常的是scriptRet = new, sagaInfoRet = undefined

        let redisCheckPromise: Promise<void> = Promise.resolve()

        if (scriptRet === 'new') {
          const fn = async () => {
            while (true) {
              const ret = await redisClient
                .multi()
                .sismember(key, rik)
                .sismember(allKey, rik)
                .exec()

              if (ret !== null && ret[0][1] && ret[1][1]) {
                break
              }

              await redisClient.multi().sadd(key, rik).sadd(allKey, rik).exec()
            }
          }

          redisCheckPromise = fn()
        }

        if (scriptRet === 'newAssignment') {
          const fn = async () => {
            while (true) {
              const b = await redisClient.sismember(key, rik)

              if (b) {
                break
              }

              await redisClient.sadd(key, rik)
            }
          }

          redisCheckPromise = fn()
        }

        let sagaInfoSavePromise: Promise<SagaInfo> | undefined

        if (!sagaInfoRet) {
          sagaInfoSavePromise = saga
            .getRepo()
            .saveSagaInfo(name, id, cmd.payload)
        }

        // 情况1.1 1.2 2.1 2.2 3.1 3.2
        if (
          scriptRet === 'new' ||
          scriptRet === 'newAssignment' ||
          scriptRet === 'exists'
        ) {
          await Promise.all([
            sagaInfoSavePromise
              ? sagaInfoSavePromise.then(saga.load)
              : saga.load(sagaInfoRet!),
            redisCheckPromise,
          ])

          yield cmd
          continue
        }

        // 情况4.1 4.2
        if (scriptRet === 'assigned') {
          if (sagaInfoSavePromise) {
            await sagaInfoSavePromise
          }

          continue
        }
      }
    }

    async function* redisChannelLoadIter() {
      let lock = createPromiseLock()
      const buffer: LoadCmd[] = []

      await channelClient.subscribe(key)
      channelClient.on('message', (_, message) => {
        buffer.push(JSON.parse(message))
        lock.resolve()
      })

      while (true) {
        await lock.promise

        while (buffer.length) {
          yield buffer.shift()!
        }
        lock = createPromiseLock()
        triggerLoad()
      }
    }

    const scheduler = createSagaScheduler(
      sagas,
      redisChannelLoadIter(),
      cmdIterHook(),
      maxSagaInstanceCount,
    )

    triggerLoad()

    return scheduler
  }
}
