namespace saga {
  describe('callRunner', async () => {
    // 1. 产生`call`日志，但不会交易`effect`函数
    // 2. 有返回`call`日志
    // 3. 产生`inverse`函数
    it('普通调用', async () => {
      const { effect, probe, call, inverse } = makeCallEffect(
        'test call',
        'success',
        'arg',
        'effect',
        'probe',
      )

      async function* historyIter(): AsyncGenerator<EventLog> {}

      const inverses: Inverse[] = []
      const stepIndex = 0

      const iter = callRunner(
        effect,
        historyIter(),
        pushInverse(inverses),
        stepIndex,
      )

      let ret = await iter.next()

      expect(ret.done).to.be.false
      expect(ret.value).to.be.deep.equal({
        type: 'precall',
        val: { name: 'test call', stepIndex: 0 },
      })
      expect(probe.called).to.be.false
      expect(call.called).to.be.false
      expect(inverse.called).to.be.false

      ret = await iter.next()
      expect(ret.done).to.be.false
      expect(ret.value).to.be.deep.equal({
        type: 'call',
        val: { name: 'test call', arg: 'arg', ret: 'effect', stepIndex: 0 },
      })
      expect(probe.called).to.be.false
      expect(call.calledOnce).to.be.true
      expect(inverse.called).to.be.false

      ret = await iter.next()
      expect(ret.done).to.be.true
      expect(ret.value).to.be.equal('effect')
      expect(probe.called).to.be.false
      expect(call.calledOnce).to.be.true
      expect(inverse.called).to.be.false

      await inverses[0].inverse()
      expect(inverse.calledOnce).to.be.true
    })

    // 1. 产生`call`日志，但不会交易`effect`函数
    // 2. 有返回`call`日志
    // 3. 产生`inverse`函数
    it('探测测试, cmd: success', async () => {
      const { effect, probe, call, inverse } = makeCallEffect(
        'test call',
        'success',
        'arg',
        'effect',
        'probe',
      )

      async function* historyIter(): AsyncGenerator<EventLog> {
        yield precallEventLog('test call', 0)
      }

      const inverses: Inverse[] = []
      const stepIndex = 0

      const iter = callRunner(
        effect,
        historyIter(),
        pushInverse(inverses),
        stepIndex,
      )

      let ret = await iter.next()

      expect(ret.done).to.be.false
      expect(ret.value).to.be.deep.equal({
        type: 'call',
        val: { name: 'test call', arg: 'arg', ret: 'probe', stepIndex: 0 },
      })
      expect(probe.called).to.be.true
      expect(call.called).to.be.false
      expect(inverse.called).to.be.false
      expect(probe.args[0][0]).to.be.equal('arg')
      expect(inverses.length).to.be.equal(1)

      ret = await iter.next()

      expect(ret.done).to.be.true
      expect(ret.value).to.be.equal('probe')
    })

    // 1. 产生`call`日志，会从新调用`effect`函数
    // 2. 有返回`call`日志
    // 3. 产生`inverse`函数
    it('探测测试, cmd: recall', async () => {
      const { effect, probe, call, inverse } = makeCallEffect(
        'test call',
        'recall',
        'arg',
        'effect',
        'probe',
      )

      async function* historyIter(): AsyncGenerator<EventLog> {
        yield precallEventLog('test call', 0)
      }

      const inverses: Inverse[] = []
      const stepIndex = 0

      const iter = callRunner(
        effect,
        historyIter(),
        pushInverse(inverses),
        stepIndex,
      )

      let ret = await iter.next()

      expect(ret.done).to.be.false
      expect(ret.value).to.be.deep.equal({
        type: 'call',
        val: { name: 'test call', arg: 'arg', ret: 'effect', stepIndex: 0 },
      })
      expect(probe.called).to.be.true
      expect(call.called).to.be.true
      expect(inverse.called).to.be.false
      expect(probe.args[0][0]).to.be.equal('arg')
      expect(call.args[0][0]).to.be.equal('arg')
      expect(inverses.length).to.be.equal(1)

      ret = await iter.next()

      expect(ret.done).to.be.true
      expect(ret.value).to.be.equal('effect')
    })

    // 1. 产生`call`日志，会从调用`inverse`和`effect`函数
    // 2. 有返回`call`日志
    // 3. 产生`inverse`函数
    it('探测测试, cmd: inverse', async () => {
      const { effect, probe, call, inverse } = makeCallEffect(
        'test call',
        'inverse',
        'arg',
        'effect',
        'probe',
      )

      async function* historyIter(): AsyncGenerator<EventLog> {
        yield precallEventLog('test call', 0)
      }

      const inverses: Inverse[] = []
      const stepIndex = 0

      const iter = callRunner(
        effect,
        historyIter(),
        pushInverse(inverses),
        stepIndex,
      )

      let ret = await iter.next()

      expect(ret.done).to.be.false
      expect(ret.value).to.be.deep.equal({
        type: 'call',
        val: { name: 'test call', arg: 'arg', ret: 'effect', stepIndex: 0 },
      })
      expect(probe.called).to.be.true
      expect(call.called).to.be.true
      expect(inverse.called).to.be.true
      expect(inverses.length).to.be.eq(1)
    })

    // 1. 有返回`call`日志
    // 2. 产生`inverse`函数
    it('有call的历史', async () => {
      const { effect, probe, call, inverse } = makeCallEffect(
        'test call',
        'success',
        'arg',
        'effect',
        'probe',
      )

      async function* historyIter(): AsyncGenerator<EventLog> {
        yield precallEventLog('test call', 0)
        yield callEventLog('test call', 0, undefined, 'history')
      }

      const inverses: Inverse[] = []
      const stepIndex = 0

      const iter = callRunner(
        effect,
        historyIter(),
        pushInverse(inverses),
        stepIndex,
      )

      let ret = await iter.next()

      expect(ret.done).to.be.true
      expect(ret.value).to.be.equal('history')
    })

    it('异常处理', async () => {
      const { effect, probe, call, inverse } = makeCallEffect(
        'test call',
        'recall',
        'arg',
        'error',
        'probe',
        true,
      )

      async function* historyIter(): AsyncGenerator<EventLog> {
        yield precallEventLog('test call', 0)
      }

      const inverses: Inverse[] = []
      const stepIndex = 0

      const iter = callRunner(
        effect,
        historyIter(),
        pushInverse(inverses),
        stepIndex,
      )

      let ret = await iter.next()

      expect(ret.done).to.be.false
      expect(ret.value!.val!.ex.toString()).to.be.deep.equal(
        new CallError('test call', 'arg', stepIndex, 'error').toString(),
      )

      try {
        await iter.next()
        throw new Error('should not be here')
      } catch (err: any) {
        expect(err.toString()).to.be.eq(
          new CallError('test call', 'arg', stepIndex, 'error').toString(),
        )
      }
    })

    it('历史异常处理', async () => {
      const { effect, probe, call, inverse } = makeCallEffect(
        'test call',
        'recall',
        'arg',
        'effect',
        'probe',
      )

      async function* historyIter(): AsyncGenerator<EventLog> {
        yield precallEventLog('test call', 0)
        yield exEventLog('test call', 0, 'error')
      }

      const inverses: Inverse[] = []
      const stepIndex = 0

      const iter = callRunner(
        effect,
        historyIter(),
        pushInverse(inverses),
        stepIndex,
      )

      try {
        await iter.next()
        throw new Error('should not be here')
      } catch (err) {
        expect(err).to.be.eq('error')
      }
    })
  })
}
