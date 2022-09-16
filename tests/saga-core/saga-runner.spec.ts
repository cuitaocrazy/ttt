namespace saga {
  describe('runner', () => {
    it('正常调用saga', async () => {
      const { callSpec } = makeCallSpec(
        'test call',
        'success',
        'effect',
        'probe',
      )

      function* saga(payload: CmdPayload) {
        yield call(callSpec, payload)
      }

      async function* historyIter() {}

      const iter = sagaRunner(saga({ id: 'test1' }), historyIter(), [])

      // precall event log
      let ret = await iter.next()

      expect(ret.value.type).to.be.eq('precall')

      // call event log
      ret = await iter.next()
      expect(ret.value.type).to.be.eq('call')

      // done
      ret = await iter.next()

      expect(ret).to.be.deep.eq({
        done: true,
        value: undefined,
      })
    })

    it('有完全历史', async () => {
      const { callSpec } = makeCallSpec(
        'test call',
        'success',
        'effect',
        'probe',
      )

      function* saga(payload: CmdPayload) {
        yield call(callSpec, payload)
      }

      async function* historyIter() {
        yield precallEventLog('test call', 0)
        yield callEventLog('test call', 0, undefined, 'effect')
      }

      const iter = sagaRunner(saga({ id: 'test1' }), historyIter(), [])

      // done
      const ret = await iter.next()

      expect(ret).to.be.deep.eq({
        done: true,
        value: undefined,
      })
    })

    it('有部分历史', async () => {
      const { callSpec, call: _call } = makeCallSpec(
        'test call',
        'success',
        'effect1',
        'probe',
      )

      function* saga(payload: CmdPayload): Generator<any, any> {
        const ret = yield call(callSpec, payload)

        yield call(callSpec, { ret, payload })
      }

      async function* historyIter() {
        yield precallEventLog('test call', 0)
        yield callEventLog('test call', 0, undefined, 'effect2')
      }

      const iter = sagaRunner(saga({ id: 'test1' }), historyIter(), [])

      // precall event log of second call
      let ret = await iter.next()

      expect(ret.value.type).to.be.eq('precall')

      // call event log of second call
      ret = await iter.next()

      expect(ret).to.be.deep.eq({
        done: false,
        value: callEventLog(
          'test call',
          1,
          { ret: 'effect2', payload: { id: 'test1' } },
          'effect1',
        ),
      })

      expect(_call.args[0][0]).to.be.deep.eq({
        ret: 'effect2',
        payload: { id: 'test1' },
      })

      // done
      ret = await iter.next()

      expect(ret).to.be.deep.eq({
        done: true,
        value: undefined,
      })
    })

    it('saga异常', async () => {
      function* saga(payload: CmdPayload) {
        throw new Error('saga error')
      }

      async function* historyIter() {}

      const iter = sagaRunner(saga({ id: 'test1' }), historyIter(), [])

      // skip event log of SagaRunnerError
      let ret = await iter.next()

      expect(ret.done).to.be.false

      const skipEventLog = ret.value as SkipEventLog

      expect(skipEventLog.type).to.be.eq('skip')
      const error = skipEventLog.val.val

      expect(error).to.be.instanceOf(SagaRunnerError)
      expect(error.message).to.be.eq('saga error')

      // rollback
      ret = await iter.next()

      expect(ret).to.be.deep.eq({
        done: false,
        value: rollbackEventLog([], error),
      })

      // done
      ret = await iter.next()

      expect(ret).to.be.deep.eq({
        done: true,
        value: undefined,
      })
    })

    it('saga异常后回退操作', async () => {
      const { callSpec } = makeCallSpec(
        'test call',
        'success',
        'effect1',
        'probe',
      )

      const error = new Error('saga error')

      function* saga(payload: CmdPayload) {
        yield call(callSpec, payload)
        throw error
      }

      async function* historyIter() {}

      const iter = sagaRunner(saga({ id: 'test1' }), historyIter(), [])

      // precall event log of first call
      await iter.next()
      // call event log of first call
      await iter.next()
      // skip event log of SagaRunnerError
      await iter.next()
      // rollback event log
      let ret = await iter.next()

      expect(ret.value.val.ex).to.be.instanceOf(SagaRunnerError)
      expect(ret.value.val.ex.cause).to.be.eq(error)
      ret.value.val.ex = error
      expect(ret).to.be.deep.eq({
        done: false,
        value: rollbackEventLog([0], error),
      })

      // inverse event log of first call
      ret = await iter.next()

      expect(ret.value.type).to.be.eq('inverse')

      // done
      ret = await iter.next()

      expect(ret).to.be.deep.eq({
        done: true,
        value: undefined,
      })
    })

    it('有历史, saga异常后回退操作', async () => {
      const { callSpec } = makeCallSpec(
        'test call',
        'success',
        'effect1',
        'probe',
      )

      const error = new Error('saga error')

      function * saga (payload: CmdPayload) {
        yield call(callSpec, payload)
        throw error
      }

      async function * historyIter () {
        yield precallEventLog('test call', 0)
        yield callEventLog('test call', 0, undefined, 'effect2')
      }

      const iter = sagaRunner(saga({ id: 'test1' }), historyIter(), [])

      // skip event log of SagaRunnerError
      await iter.next()
      // rollback event log
      await iter.next()
      // inverse event log of first call
      let ret = await iter.next()

      expect(ret.value.type)
        .to.be.eq('inverse')

      // done
      ret = await iter.next()

      expect(ret)
        .to.be.deep.eq({
          done: true,
          value: undefined,
        })
    })

    it('有历史, 有rollback日志, saga异常后回退操作', async () => {
      const { callSpec } = makeCallSpec(
        'test call',
        'success',
        'effect1',
        'probe',
      )

      const error = new Error('saga error')

      function * saga (payload: CmdPayload) {
        yield call(callSpec, payload)
        throw error
      }

      async function * historyIter () {
        yield precallEventLog('test call', 0)
        yield callEventLog('test call', 0, undefined, 'effect2')
        yield rollbackEventLog([0], error)
      }

      const iter = sagaRunner(saga({ id: 'test1' }), historyIter(), [])

      // skip event log of SagaRunnerError
      await iter.next()
      // inverse event log of first call
      let ret = await iter.next()

      expect(ret.value.type)
        .to.be.eq('inverse')

      // done
      ret = await iter.next()

      expect(ret)
        .to.be.deep.eq({
          done: true,
          value: undefined,
        })
    })
  })
}
