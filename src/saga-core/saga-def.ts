namespace saga {
  /**
   * Cmd负载
   */
  export type CmdPayload = {
    /**
     * Cmd的唯一标识
     */
    readonly id: string
    readonly [key: string]: any
  }

  /**
   * Cmd
   */
  export type Cmd = {
    /**
     * 类型
     */
    readonly type: string
    /**
     * 负载
     */
    readonly payload: CmdPayload
  }

  /**
   * LoadCmd
   */
  export type LoadCmd = {
    readonly id: string
    readonly name: string
  }
}
