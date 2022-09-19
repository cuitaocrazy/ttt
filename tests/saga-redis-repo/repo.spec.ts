namespace saga {
  const { expect }: typeof import('chai') = require('chai')
  // const sinon: typeof import('sinon') = require('sinon')
  const Redis: typeof import('ioredis').default = require('ioredis').default
  type Redis = import('ioredis').default
  const RedisMemoryServer: typeof import('redis-memory-server').RedisMemoryServer = require('redis-memory-server').RedisMemoryServer
  type RedisMemoryServer = import('redis-memory-server').RedisMemoryServer


  describe('repo test', async () => {
    let host: string
    let port: number
    let server: RedisMemoryServer
    let client: Redis

    before(async () => {
      server = new RedisMemoryServer()
      host = await server.getHost()
      port = await server.getPort()
    })

    after(async () => {
      await server.stop()
    })

    beforeEach(async () => {
      client = new Redis(port, host)
      client.on('error', (err) => {
        console.error(err)
      })
    })

    afterEach(async () => {
      await client.quit()
    })

    it('一般测试', async () => {
      await client.flushdb()
      const repo = new RedisSagaHistory(client)

      const info = await repo.saveSagaInfo('testsaga', 'testid', {
        id: 'testid',
      })

      const result = await repo.getSagaInfo('testsaga', 'testid')

      expect(info).to.be.deep.eq(result)

      await repo.saveEventLog('testsaga', 'testid', {
        type: 'precall',
        val: { name: 'test call', stepIndex: 0 },
      })
      await repo.saveEventLog('testsaga', 'testid', {
        type: 'call',
        val: {
          name: 'test call',
          stepIndex: 0,
          arg: 'arg1',
        },
      })
      await repo.saveEventLog('testsaga', 'testid', {
        type: 'ex',
        val: { name: 'test call', stepIndex: 1, ex: new Error('error') },
      })

      const logs = repo.getEventLogs('testsaga', 'testid')

      const l1 = await logs.next()

      expect(l1.value).to.be.deep.eq({
        type: 'precall',
        val: { name: 'test call', stepIndex: 0 },
      })

      const l2 = await logs.next()

      expect(l2.value).to.be.deep.eq({
        type: 'call',
        val: {
          name: 'test call',
          stepIndex: 0,
          arg: 'arg1',
        },
      })

      const l3 = await logs.next()

      expect(l3.value.val.ex).to.be.instanceOf(Error)
      expect(l3.value.val.ex.message).to.be.eq('error')
      delete l3.value.val.ex
      expect(l3.value).to.be.deep.eq({
        type: 'ex',
        val: {
          name: 'test call',
          stepIndex: 1,
        },
      })

      const l4 = await logs.next()

      expect(l4.done).to.be.true

      await repo.done('testsaga', 'testid', 'test result')

      const doneInfo = await client.get(doneInfoKey('testsaga', 'testid'))

      expect(
        JSON.parse(doneInfo!, (k, v) => {
          if (k === 'createTime') {
            return new Date(v)
          }
          return v
        }),
      ).to.be.deep.eq({
        ...info,
        status: 'done',
        ret: 'test result',
        retStatus: 'success',
      })

      console.log('cuitao:' + doneEventKey('testsaga', 'testid'))
      const eventCount = await client.llen(doneEventKey('testsaga', 'testid'))

      expect(eventCount).to.be.eq(3)

      await client.del(doneInfoKey('testsaga', 'testid'))
      await client.set(
        runningInfoKey('testsaga', 'testid'),
        JSON.stringify(info),
      )
      await client.rename(
        doneEventKey('testsaga', 'testid'),
        runningEventKey('testsaga', 'testid'),
      )

      await repo.rollback('testsaga', 'testid', new Error('rollback'))

      const sagaInfoRet = await repo.getSagaInfo('testsaga', 'testid')

      expect(sagaInfoRet?.ret).to.be.instanceOf(Error)
      expect(sagaInfoRet?.ret.message).to.be.eq('rollback')
      delete sagaInfoRet?.ret
      expect(sagaInfoRet).to.be.deep.eq({
        ...info,
        status: 'rollbacking',
        retStatus: 'fail',
      })

      await repo.discardDamagedSaga('testsaga', 'testid')

      expect(await client.exists(errInfoKey('testsaga', 'testid'))).to.be.eq(1)

      expect(await client.exists(errEventKey('testsaga', 'testid'))).to.be.eq(1)
    })
  })
}
