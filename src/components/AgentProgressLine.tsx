import * as React from 'react'
import { Box, Text } from '../ink.js'
import { formatNumber } from '../utils/format.js'
import type { Theme } from '../utils/theme.js'
import {
  formatTokenCount,
  formatToolUseCount,
  tUi,
  useUiLanguage,
} from '../utils/uiLanguage.js'

type Props = {
  agentType: string
  description?: string
  name?: string
  descriptionColor?: keyof Theme
  taskDescription?: string
  toolUseCount: number
  tokens: number | null
  color?: keyof Theme
  isLast: boolean
  isResolved: boolean
  isError: boolean
  isAsync?: boolean
  shouldAnimate: boolean
  lastToolInfo?: string | null
  hideType?: boolean
}

export function AgentProgressLine({
  agentType,
  description,
  name,
  descriptionColor,
  taskDescription,
  toolUseCount,
  tokens,
  color,
  isLast,
  isResolved,
  isError: _isError,
  isAsync = false,
  shouldAnimate: _shouldAnimate,
  lastToolInfo,
  hideType = false,
}: Props): React.ReactNode {
  const uiLanguage = useUiLanguage()
  const treeChar = isLast ? '└─' : '├─'
  const isBackgrounded = isAsync && isResolved

  const statusText = !isResolved
    ? lastToolInfo || tUi('초기화 중…', 'Initializing…', uiLanguage)
    : isBackgrounded
      ? taskDescription ??
        tUi('백그라운드에서 실행 중', 'Running in the background', uiLanguage)
      : tUi('완료', 'Done', uiLanguage)

  return (
    <Box flexDirection="column">
      <Box paddingLeft={3}>
        <Text dimColor>{treeChar} </Text>
        <Text dimColor={!isResolved}>
          {hideType ? (
            <>
              <Text bold>{name ?? description ?? agentType}</Text>
              {name && description && <Text dimColor>: {description}</Text>}
            </>
          ) : (
            <>
              <Text
                bold
                backgroundColor={color}
                color={color ? 'inverseText' : undefined}
              >
                {agentType}
              </Text>
              {description && (
                <>
                  {' ('}
                  <Text
                    backgroundColor={descriptionColor}
                    color={descriptionColor ? 'inverseText' : undefined}
                  >
                    {description}
                  </Text>
                  {')'}
                </>
              )}
            </>
          )}
          {!isBackgrounded && (
            <>
              {' · '}
              {formatToolUseCount(toolUseCount, uiLanguage)}
              {tokens !== null && (
                <>
                  {' · '}
                  {formatTokenCount(formatNumber(tokens), uiLanguage)}
                </>
              )}
            </>
          )}
        </Text>
      </Box>
      {!isBackgrounded && (
        <Box paddingLeft={3} flexDirection="row">
          <Text dimColor>{isLast ? '   ⎿  ' : '│  ⎿  '}</Text>
          <Text dimColor>{statusText}</Text>
        </Box>
      )}
    </Box>
  )
}
