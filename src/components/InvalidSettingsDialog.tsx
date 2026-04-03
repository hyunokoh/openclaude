import React from 'react'
import { Text } from '../ink.js'
import type { ValidationError } from '../utils/settings/validation.js'
import { Select } from './CustomSelect/index.js'
import { Dialog } from './design-system/Dialog.js'
import { ValidationErrorsList } from './ValidationErrorsList.js'

type Props = {
  settingsErrors: ValidationError[]
  onContinue: () => void
  onExit: () => void
}

/**
 * Dialog shown when settings files have validation errors.
 * User must choose to continue (skipping invalid files) or exit to fix them.
 */
export function InvalidSettingsDialog({
  settingsErrors,
  onContinue,
  onExit,
}: Props): React.ReactNode {
  function handleSelect(value: string): void {
    if (value === 'exit') {
      onExit()
    } else {
      onContinue()
    }
  }

  return (
    <Dialog title="설정 오류" onCancel={onExit} color="warning">
      <ValidationErrorsList errors={settingsErrors} />
      <Text dimColor>
        오류가 있는 파일은 잘못된 설정만이 아니라 파일 전체가 건너뛰어집니다.
      </Text>
      <Select
        options={[
          { label: '종료 후 직접 수정', value: 'exit' },
          {
            label: '이 설정 없이 계속',
            value: 'continue',
          },
        ]}
        onChange={handleSelect}
      />
    </Dialog>
  )
}
