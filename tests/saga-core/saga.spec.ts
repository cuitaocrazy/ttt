namespace saga {
  describe('Saga', () => {
    describe('run测试', () => {
      it('新执行, 在runtime时保证幂等', async () => {
        const name = 'test saga'
        const { callSpec } = makeCallSpec(
          'test call',
          'success',
          'effect1',
          'probe',
        )
        let doneTimes = 0
        let _r: (value: void | PromiseLike<void>) => void

        const p = new Promise((resolve) => {
          _r = resolve
        })
        const id = 'test1'

        function* effectSaga(payload: CmdPayload) {
          yield call(callSpec, payload)
        }

        const repo = new MemorySagaHistory()

        const logs: RegularSagaLogType[] = []

        function logger(sagaName: string, id: string, log: RegularSagaLogType) {
          logs.push(log)
        }

        const saga = createSaga(name, effectSaga, repo, logger, [])

        saga.registoryInstanceDoneCallback(() => {
          doneTimes++
          _r()
        })

        const cmdPayload = { id }

        await saga.run(cmdPayload)
        const ids = await repo.getAllIds(name)

        expect(ids[0]).to.be.eq(id)
        const sagaInfo = (await repo.getSagaInfo(name, id)) as SagaInfo

        expect(sagaInfo.id).to.be.eq(id)
        expect(sagaInfo.payload).to.be.deep.eq(cmdPayload)

        expect(saga.getDoneTimes()).to.be.eq(0)
        expect(saga.getInstanceCount()).to.be.eq(1)
        expect(saga.getInstances()[id]).not.to.be.undefined
        expect(saga.getRollbackTimes()).to.be.eq(0)

        // 幂等性测试
        await saga.run(cmdPayload)

        await p
        // 期望有3条log, 第一条是`precall`, 第二条是`call`, 第三条是`done`
        expect(logs.length).to.be.eq(3)

        const expectDone = await repo.getSagaInfo(name, id)

        expect(expectDone?.status).to.be.eq('done')

        expect(saga.getDoneTimes()).to.be.eq(1)
        expect(saga.getInstanceCount()).to.be.eq(0)
        expect(saga.getInstances()[id]).to.be.undefined
        expect(saga.getRollbackTimes()).to.be.eq(0)

        // 幂等性测试
        expect(doneTimes).to.be.eq(1)
      })

      it('存在历史, 但未完成, 保证幂等', async () => {
        const name = 'test saga'
        const { callSpec } = makeCallSpec(
          'test call',
          'success',
          'effect1',
          'probe',
        )
        let _r: (value: void | PromiseLike<void>) => void

        const p = new Promise((resolve) => {
          _r = resolve
        })
        const id = 'test1'

        function* effectSaga(payload: CmdPayload) {
          yield call(callSpec, payload)
        }

        const logMap: {
          [key: string]: { [key: string]: [SagaInfo, EventLog[]] }
        } = {
          'test saga': {
            test1: [
              {
                status: 'running',
                createTime: new Date(),
                id,
                payload: {
                  id,
                },
              },
              [
                {
                  type: 'precall',
                  val: {
                    name: 'test call',
                    stepIndex: 0,
                  },
                },
                {
                  type: 'call',
                  val: {
                    name: 'test call',
                    stepIndex: 0,
                    arg: {
                      id: 'test1',
                    },
                  },
                },
              ],
            ],
          },
        }

        const repo = new MemorySagaHistory(logMap)

        const logs: RegularSagaLogType[] = []

        function logger(sagaName: string, id: string, log: RegularSagaLogType) {
          logs.push(log)
        }

        const saga = createSaga(name, effectSaga, repo, logger, [])

        saga.registoryInstanceDoneCallback(() => {
          _r()
        })

        const cmdPayload = { id }

        await saga.run(cmdPayload)
        const ids = await repo.getAllIds(name)

        expect(ids[0]).to.be.eq(id)
        const sagaInfo = (await repo.getSagaInfo(name, id)) as SagaInfo

        expect(sagaInfo.id).to.be.eq(id)
        expect(sagaInfo.payload).to.be.deep.eq(cmdPayload)

        expect(saga.getDoneTimes()).to.be.eq(0)
        expect(saga.getInstanceCount()).to.be.eq(1)
        expect(saga.getInstances()[id]).not.to.be.undefined
        expect(saga.getRollbackTimes()).to.be.eq(0)

        await p
        // 期望有1条log, 是`done`
        expect(logs.length).to.be.eq(1)

        const expectDone = await repo.getSagaInfo(name, id)

        expect(expectDone?.status).to.be.eq('done')

        expect(saga.getDoneTimes()).to.be.eq(1)
        expect(saga.getInstanceCount()).to.be.eq(0)
        expect(saga.getInstances()[id]).to.be.undefined
        expect(saga.getRollbackTimes()).to.be.eq(0)
      })

      it('执行完毕, 保证幂等', async () => {
        const name = 'test saga'
        const { callSpec } = makeCallSpec(
          'test call',
          'success',
          'effect1',
          'probe',
        )

        let doneTimes = 0

        const id = 'test1'

        function* effectSaga(payload: CmdPayload) {
          yield call(callSpec, payload)
        }

        const repo = new MemorySagaHistory(
          {},
          {
            [name]: {
              [id]: {
                status: 'done',
                createTime: new Date(),
                id,
                payload: {
                  id,
                },
              },
            },
          },
        )

        const logs: RegularSagaLogType[] = []

        function logger(sagaName: string, id: string, log: RegularSagaLogType) {
          logs.push(log)
        }

        const saga = createSaga(name, effectSaga, repo, logger, [])

        saga.registoryInstanceDoneCallback(() => {
          doneTimes++
        })

        const cmdPayload = { id }

        await saga.run(cmdPayload)

        expect(saga.getDoneTimes()).to.be.eq(0)
        expect(saga.getInstanceCount()).to.be.eq(0)
        expect(saga.getRollbackTimes()).to.be.eq(0)
        expect(doneTimes).to.be.eq(0)
        // 无log输出
        expect(logs.length).to.be.eq(0)
      })

      describe('幂等检查', () => {
        it('在runtime并payload不一致时, 输出错误日志', async () => {
          const name = 'test saga'
          const { callSpec } = makeCallSpec(
            'test call',
            'success',
            'effect1',
            'probe',
          )
          let _r: (value: void | PromiseLike<void>) => void

          const p = new Promise((resolve) => {
            _r = resolve
          })
          const id = 'test1'

          function* effectSaga(payload: CmdPayload) {
            yield call(callSpec, payload)
          }

          const repo = new MemorySagaHistory()

          const logs: RegularSagaLogType[] = []

          function logger(
            sagaName: string,
            id: string,
            log: RegularSagaLogType,
          ) {
            logs.push(log)
          }

          const saga = createSaga(name, effectSaga, repo, logger, [])

          const cmdPayload1 = { id, v: 'v1' }

          await saga.run(cmdPayload1)

          const cmdPayload2 = { id, v: 'v2' }

          await saga.run(cmdPayload2)

          expect(logs.length).to.be.eq(1)
          expect(logs[0].type).to.be.eq('error')

          // @ts-ignore
          _r()
        })

        it('存在历史, 但未完成时, payload不一致时, 输出错误日志', async () => {
          const name = 'test saga'
          const { callSpec } = makeCallSpec(
            'test call',
            'success',
            'effect1',
            'probe',
          )
          const id = 'test1'

          function* effectSaga(payload: CmdPayload) {
            yield call(callSpec, payload)
          }

          const logMap: {
            [key: string]: { [key: string]: [SagaInfo, EventLog[]] }
          } = {
            'test saga': {
              test1: [
                {
                  status: 'running',
                  createTime: new Date(),
                  id,
                  payload: {
                    id,
                    // 原始
                    v: 'v1',
                  },
                },
                [
                  {
                    type: 'precall',
                    val: {
                      name: 'test call',
                      stepIndex: 0,
                    },
                  },
                  {
                    type: 'call',
                    val: {
                      name: 'test call',
                      stepIndex: 0,
                      arg: {
                        id: 'test1',
                      },
                    },
                  },
                ],
              ],
            },
          }

          const repo = new MemorySagaHistory(logMap)

          const logs: RegularSagaLogType[] = []

          function logger(
            sagaName: string,
            id: string,
            log: RegularSagaLogType,
          ) {
            logs.push(log)
          }

          const saga = createSaga(name, effectSaga, repo, logger, [])

          const cmdPayload = { id, v: 'v2' }

          await saga.run(cmdPayload)

          expect(logs.length).to.be.eq(1)
          expect(logs[0].type).to.be.eq('error')
        })

        it('执行完毕,  payload不一致时, 输出错误日志', async () => {
          const name = 'test saga'
          const { callSpec } = makeCallSpec(
            'test call',
            'success',
            'effect1',
            'probe',
          )

          const id = 'test1'

          function* effectSaga(payload: CmdPayload) {
            yield call(callSpec, payload)
          }

          const repo = new MemorySagaHistory(
            {},
            {
              [name]: {
                [id]: {
                  status: 'done',
                  createTime: new Date(),
                  id,
                  payload: {
                    id,
                    // 原始
                    v: 'v1',
                  },
                },
              },
            },
          )

          const logs: RegularSagaLogType[] = []

          function logger(
            sagaName: string,
            id: string,
            log: RegularSagaLogType,
          ) {
            logs.push(log)
          }

          const saga = createSaga(name, effectSaga, repo, logger, [])

          const cmdPayload = { id, v: 'v2' }

          await saga.run(cmdPayload)

          expect(logs.length).to.be.eq(1)
          expect(logs[0].type).to.be.eq('error')
        })
      })

      it('执行获取返回值', async () => {
        function* effectSaga(payload: CmdPayload) {
          return payload.id
        }
        const name = 'test saga'
        const id = 'test1'

        const repo = new MemorySagaHistory()

        const logs: RegularSagaLogType[] = []

        function logger(sagaName: string, id: string, log: RegularSagaLogType) {
          logs.push(log)
        }

        const saga = createSaga(name, effectSaga, repo, logger, [])

        const ret = await saga.run({ id })
        const v = await ret.wait

        expect(v).to.be.eq(id)
      })

      it('执行可接收到异常', async () => {
        function* effectSaga(payload: CmdPayload) {
          throw new Error('err')
        }

        const name = 'test saga'
        const id = 'test1'

        const repo = new MemorySagaHistory()

        const logs: RegularSagaLogType[] = []

        function logger(sagaName: string, id: string, log: RegularSagaLogType) {
          logs.push(log)
        }

        const saga = createSaga(name, effectSaga, repo, logger, [])

        const ret = await saga.run({ id })

        try {
          await ret.wait
        } catch (ex) {
          expect((ex as SagaRunnerError).message).to.be.eq('err')
        }
      })
    })

    describe('load测试', () => {
      it('正确load执行, 并有幂等性', async () => {
        const name = 'test saga'
        const { callSpec } = makeCallSpec(
          'test call',
          'success',
          'effect1',
          'probe',
        )
        let _r: (value: void | PromiseLike<void>) => void

        const p = new Promise((resolve) => {
          _r = resolve
        })
        const id = 'test1'

        function* effectSaga(payload: CmdPayload) {
          yield call(callSpec, payload)
        }

        const logMap: {
          [key: string]: { [key: string]: [SagaInfo, EventLog[]] }
        } = {
          'test saga': {
            test1: [
              {
                status: 'running',
                createTime: new Date(),
                id,
                payload: {
                  id,
                },
              },
              [
                {
                  type: 'precall',
                  val: {
                    name: 'test call',
                    stepIndex: 0,
                  },
                },
                {
                  type: 'call',
                  val: {
                    name: 'test call',
                    stepIndex: 0,
                    arg: {
                      id: 'test1',
                    },
                  },
                },
              ],
            ],
          },
        }

        const repo = new MemorySagaHistory(logMap)

        const logs: RegularSagaLogType[] = []

        function logger(sagaName: string, id: string, log: RegularSagaLogType) {
          logs.push(log)
        }

        const saga = createSaga(name, effectSaga, repo, logger, [])

        saga.registoryInstanceDoneCallback(() => {
          _r()
        })

        await saga.load(id)
        // 幂等
        await saga.load(id)

        expect(saga.getInstanceCount()).to.be.eq(1)

        await p
        // 期望有1条log, 是`done`
        expect(logs.length).to.be.eq(1)

        const expectDone = await repo.getSagaInfo(name, id)

        expect(expectDone?.status).to.be.eq('done')
      })

      it('执行完毕, 保证幂等', async () => {
        const name = 'test saga'
        const { callSpec } = makeCallSpec(
          'test call',
          'success',
          'effect1',
          'probe',
        )

        let doneTimes = 0

        const id = 'test1'

        function* effectSaga(payload: CmdPayload) {
          yield call(callSpec, payload)
        }

        const repo = new MemorySagaHistory(
          {},
          {
            [name]: {
              [id]: {
                status: 'done',
                createTime: new Date(),
                id,
                payload: {
                  id,
                },
              },
            },
          },
        )

        const logs: RegularSagaLogType[] = []

        function logger(sagaName: string, id: string, log: RegularSagaLogType) {
          logs.push(log)
        }

        const saga = createSaga(name, effectSaga, repo, logger, [])

        saga.registoryInstanceDoneCallback(() => {
          doneTimes++
        })

        await saga.load(id)

        expect(saga.getDoneTimes()).to.be.eq(0)
        expect(saga.getInstanceCount()).to.be.eq(0)
        expect(saga.getRollbackTimes()).to.be.eq(0)
        expect(doneTimes).to.be.eq(1)
        // 无log输出
        expect(logs.length).to.be.eq(0)
      })

      it('无存在id时, 输出错误日志', async () => {
        const name = 'test saga'
        const { callSpec } = makeCallSpec(
          'test call',
          'success',
          'effect1',
          'probe',
        )

        const id = 'test1'

        function* effectSaga(payload: CmdPayload) {
          yield call(callSpec, payload)
        }

        const repo = new MemorySagaHistory({}, {})

        const logs: RegularSagaLogType[] = []

        function logger(sagaName: string, id: string, log: RegularSagaLogType) {
          logs.push(log)
        }

        const saga = createSaga(name, effectSaga, repo, logger, [])

        await saga.load(id)

        expect(logs.length).to.be.eq(1)
        expect(logs[0].type).to.be.eq('error')
      })
    })
  })
}
