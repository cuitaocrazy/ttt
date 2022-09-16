namespace saga {
  /**
   * effect符号
   *
   * 用于区分effect包装器类型
   */
  export const effectSymbol = Symbol.for('effect')

  /**
   * effect类型
   */
  export type EffectTypes = 'call'

  export type EffectSpec = {
    name: string
  }
  /**
   * effect包装器
   *
   * 提供给runner执行effect的描述
   */
  export type EffectWrapper = {
    /**
     * effect类型
     */
    [effectSymbol]: EffectTypes
    /**
     * effect
     */
    effect: EffectSpec
  }

  // type Mix<T, U> = T & U

  export type SagaGenerator = Generator<EffectWrapper>

  /**
   * 增强的调用探针结果
   *
   * 告诉runner如何执行effect
   */
  export type EnhancedCallProbeResult<RET> = {
    responseCommand: 'success' | 'recall' | 'inverse'
    ret?: RET
  }

  /**
   * Call规格描述
   */
  export interface CallSpec<ARG, RET> {
    name: string
    /**
     * 探针
     * @param arg 调用参数
     * @returns 探针结果
     */
    probe: (arg: ARG) => Promise<EnhancedCallProbeResult<RET>>
    /**
     * 调用
     * @param arg 调用参数
     * @returns 调用结果
     */
    call: (arg: ARG) => Promise<RET>
    /**
     * 反调
     * @param arg 调用参数
     * @param possibleRet 可能的返回值
     * @returns 反调结果
     */
    inverse: (
      arg: ARG,
      possibleRet: { becalled: boolean; ret?: RET },
    ) => Promise<void>
  }

  /**
   * call的effect包装器
   *
   */
  export type CallEffect<ARG = any, RET = any> = {
    /**
     * effect类型
     */
    [effectSymbol]: 'call'
    /**
     * effect规格
     */
    effect: CallSpec<ARG, RET>
    /**
     * 调用参数
     */
    arg: ARG
  }

  /**
   * 用户的call接口函数
   *
   * @param effect 调用的effect
   * @param arg 调用参数
   * @returns 提供给runner的effect包装器
   */
  export function call<ARG, RET>(
    effect: CallSpec<ARG, RET>,
    arg: ARG,
  ): CallEffect<ARG, RET> {
    return {
      [effectSymbol]: 'call',
      effect,
      arg,
    }
  }
}
