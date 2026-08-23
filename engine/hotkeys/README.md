# Hotkey Compressor

Explicit hotkey flow. No background key capture.

## Use Manually

Select text in any app, then run:

```powershell
<CRISP_HOME>\hotkeys\compress-selection.ps1
```

It copies the selected text, compresses it locally, and puts compressed text on clipboard.

To replace selected text:

```powershell
<CRISP_HOME>\hotkeys\compress-selection.ps1 -ReplaceSelection
```

## Optional Hotkey

Bind a launcher such as AutoHotkey, PowerToys, or a keyboard macro to:

```powershell
powershell.exe -ExecutionPolicy Bypass -File "<CRISP_HOME>\hotkeys\compress-selection.ps1" -ReplaceSelection
```

Do not use global keystroke logging. Use explicit selected-text compression only.
