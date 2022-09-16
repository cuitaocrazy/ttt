namespace saga {
  /**
   * EventLogType
   */
  export type EventLogType =
    | 'call'
    | 'ex'
    | 'precall'
    | 'inverse'
    | 'skip'
    | 'rollback'

  export type CallEventLog = {
    type: 'call'
    val: {
      name: string
      ret?: any
      stepIndex: number
      arg?: any
    }
  }

  export type ExEventLog = {
    type: 'ex'
    val: {
      name: string
      stepIndex: number
      ex: any
    }
  }

  export type PrecallEventLog = {
    type: 'precall'
    val: {
      name: string
      stepIndex: number
    }
  }

  export type InverseEventLog = {
    type: 'inverse'
    val: {
      name: string
      stepIndex: number
    }
  }

  export type SkipExVal = {
    type: 'err'
    val: any
  }

  export type SkipMsgVal = {
    type: 'msg'
    val: string
  }

  export type SkipEventLog = {
    type: 'skip'
    stepIndex: number
    val: SkipExVal | SkipMsgVal
  }

  export type RollbackEventLog = {
    type: 'rollback'
    val: {
      inverseIndexs: number[]
      ex: any
    }
  }

  /**
   * runner的执行事件日志
   */
  export type EventLog =
    | CallEventLog
    | ExEventLog
    | PrecallEventLog
    | InverseEventLog
    | SkipEventLog
    | RollbackEventLog

  export const precallEventLog = (
    name: string,
    stepIndex: number,
  ): PrecallEventLog => ({ type: 'precall', val: { name, stepIndex } })
  export const callEventLog = (
    name: string,
    stepIndex: number,
    arg: any,
    ret: any,
  ): CallEventLog => ({ type: 'call', val: { name, stepIndex, ret, arg } })
  export const exEventLog = (
    name: string,
    stepIndex: number,
    ex: any,
  ): ExEventLog => ({ type: 'ex', val: { stepIndex, ex, name } })
  export const skipExEventLog = (stepIndex: number, ex: any): SkipEventLog => ({
    type: 'skip',
    stepIndex,
    val: { type: 'err', val: ex },
  })
  export const skipMsgEventLog = (
    stepIndex: number,
    msg: string,
  ): SkipEventLog => ({
    type: 'skip',
    stepIndex,
    val: { type: 'msg', val: msg },
  })
  export const inverseEventLog = (
    name: string,
    stepIndex: number,
  ): InverseEventLog => ({ type: 'inverse', val: { name, stepIndex } })
  export const rollbackEventLog = (
    inverseIndexs: number[],
    ex: any,
  ): RollbackEventLog => ({ type: 'rollback', val: { inverseIndexs, ex } })

  export type SagaInfo = {
    status: 'running' | 'rollbacking' | 'done'
    createTime: Date
    id: string
    payload: CmdPayload
    retStatus?: 'success' | 'fail'
    ret?: any
  }
  export type SagaInfoRet = SagaInfo | undefined

  export interface SagaHistory {
    getSagaId(sagaName: string, payload: CmdPayload): string
    getEventLogs(sagaName: string, id: string): AsyncGenerator<EventLog>
    getAllIds(sagaName: string): Promise<string[]>
    getSagaInfo(sagaName: string, id: string): Promise<SagaInfoRet>
    saveSagaInfo(
      sagaName: string,
      id: string,
      payload: CmdPayload,
    ): Promise<SagaInfo>
    saveEventLog(sagaName: string, id: string, log: EventLog): Promise<void>
    done(sagaName: string, id: string, ret?: any): Promise<void>
    rollback(sagaName: string, id: string, ex: any): Promise<void>
    discardDamagedSaga(sagaName: string, id: string): Promise<void>
  }

  export class MemorySagaHistory implements SagaHistory {
    logMap: { [key: string]: { [key: string]: [SagaInfo, EventLog[]] } }
    doneMap: { [key: string]: { [key: string]: SagaInfo } }

    constructor(
      logMap: { [key: string]: { [key: string]: [SagaInfo, EventLog[]] } } = {},
      doneMap: { [key: string]: { [key: string]: SagaInfo } } = {},
    ) {
      this.logMap = logMap
      this.doneMap = doneMap
    }

    async discardDamagedSaga(sagaName: string, id: string): Promise<void> {
      delete this.logMap[sagaName][id]
    }

    getSagaId(sagaName: string, payload: CmdPayload): string {
      return payload.id
    }

    async *getEventLogs(
      sagaName: string,
      id: string,
    ): AsyncGenerator<EventLog> {
      const logs = this.logMap[sagaName]?.[id][1] || []

      for (const log of logs) {
        yield log
      }
    }

    getAllIds(sagaName: string): Promise<string[]> {
      return Promise.resolve(Object.keys(this.logMap[sagaName] || {}))
    }

    getSagaInfo(sagaName: string, id: string): Promise<SagaInfoRet> {
      const sagaLog = this.logMap[sagaName]?.[id]

      if (this.doneMap[sagaName]?.[id]) {
        return Promise.resolve(this.doneMap[sagaName]?.[id])
      }

      if (sagaLog) {
        return Promise.resolve(sagaLog[0])
      } else {
        return Promise.resolve(undefined)
      }
    }

    saveSagaInfo(
      sagaName: string,
      id: string,
      payload: CmdPayload,
    ): Promise<SagaInfo> {
      this.logMap[sagaName] = this.logMap[sagaName] || {}
      this.logMap[sagaName][id] = this.logMap[sagaName][id] || [
        { createTime: new Date(), id, payload, status: 'running' },
        [],
      ]
      return Promise.resolve(this.logMap[sagaName][id][0])
    }

    saveEventLog(sagaName: string, id: string, log: EventLog): Promise<void> {
      this.logMap[sagaName][id][1].push(log)
      return Promise.resolve()
    }

    done(sagaName: string, id: string, ret?: any): Promise<void> {
      this.doneMap[sagaName] = {}
      const info = this.logMap[sagaName][id][0]

      this.doneMap[sagaName][id] =
        info.status === 'rollbacking'
          ? { ...info, status: 'done' }
          : { ...info, status: 'done', retStatus: 'success', ret }
      delete this.logMap[sagaName][id]
      return Promise.resolve()
    }

    rollback(sagaName: string, id: string, ex: any): Promise<void> {
      const info = this.logMap[sagaName][id][0]

      info.retStatus = 'fail'
      info.ret = ex
      info.status = 'rollbacking'
      return Promise.resolve()
    }
  }
}
