namespace saga {
  export type RegularSagaLogType =
    | EventLog
    | { type: 'done'; duration: number }
    | { type: 'error'; error: any }
  export type RegularSagaLogger = (
    sagaName: string,
    id: string,
    log: RegularSagaLogType,
  ) => void

  export type SagaCallLog = {
    type: 'call'
    sagaName: string
    id: string
    effectName: string
    arg: any
    stepIndex: number
    ret: any
  }

  export type SagaPrecallLog = {
    type: 'precall'
    sagaName: string
    id: string
    effectName: string
    stepIndex: number
  }

  export type SagaExLog = {
    type: 'ex'
    sagaName: string
    id: string
    ex: any
    stepIndex: number
  }

  export type SagaInverseLog = {
    type: 'inverse'
    sagaName: string
    id: string
    effectName: string
    stepIndex: number
  }

  export type SagaRollbackLog = {
    type: 'rollback'
    sagaName: string
    id: string
    inverseIndexs: number[]
    ex: any
  }

  export type SagaSkipLog = {
    type: 'skip'
    sagaName: string
    id: string
    ex?: any
    msg?: string
  }

  export type SagaDoneLog = {
    type: 'done'
    sagaName: string
    id: string
    duration: number
  }

  export type SagaErrorLog = {
    type: 'error'
    sagaName: string
    id: string
    error: string
  }

  export type SagaLogType = EventLogType | 'done' | 'error'

  export type SagaLog = { type: SagaLogType; module: 'saga' } & (
    | SagaCallLog
    | SagaPrecallLog
    | SagaExLog
    | SagaInverseLog
    | SagaRollbackLog
    | SagaSkipLog
    | SagaDoneLog
    | SagaErrorLog
  )

  export type Logger = (
    level: 'info' | 'warn' | 'error' | 'debug',
    log: SagaLog,
  ) => void

  export function regularSagaLogger(logger: Logger): RegularSagaLogger {
    return function (sagaName: string, id: string, log: RegularSagaLogType) {
      switch (log.type) {
        case 'call':
          logger('debug', {
            type: 'call',
            sagaName,
            id,
            effectName: log.val.name,
            arg: log.val.arg,
            stepIndex: log.val.stepIndex,
            ret: log.val.ret,
            module: 'saga',
          })
          break
        case 'precall':
          logger('debug', {
            type: 'precall',
            sagaName,
            id,
            effectName: log.val.name,
            stepIndex: log.val.stepIndex,
            module: 'saga',
          })
          break
        case 'ex':
          logger('error', {
            type: 'ex',
            sagaName,
            id,
            stepIndex: log.val.stepIndex,
            ex: log.val.ex,
            module: 'saga',
          })
          break
        case 'inverse':
          logger('debug', {
            type: 'inverse',
            sagaName,
            id,
            effectName: log.val.name,
            stepIndex: log.val.stepIndex,
            module: 'saga',
          })
          break
        case 'rollback':
          logger('error', {
            type: 'rollback',
            sagaName,
            id,
            inverseIndexs: log.val.inverseIndexs,
            ex: log.val.ex,
            module: 'saga',
          })
          break
        case 'skip':
          if (log.val.type === 'err') {
            logger('warn', {
              type: 'skip',
              sagaName,
              id,
              ex: log.val.val,
              module: 'saga',
            })
          } else {
            logger('info', {
              type: 'skip',
              sagaName,
              id,
              msg: log.val.val,
              module: 'saga',
            })
          }
          break
        case 'done':
          logger('info', {
            type: 'done',
            sagaName,
            id,
            duration: log.duration,
            module: 'saga',
          })
          break
        case 'error':
          logger('error', {
            type: 'error',
            sagaName,
            id,
            error: log.error,
            module: 'saga',
          })
          break
      }
    }
  }
}
