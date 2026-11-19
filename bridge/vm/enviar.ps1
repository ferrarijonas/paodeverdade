# Envia a ponte para a VM e roda o instalador (do Windows, na raiz do site).
# Uso: .\bridge\vm\enviar.ps1 -Vm 123.45.67.89 [-Usuario ubuntu] [-Chave C:\caminho\chave.key]
param(
  [Parameter(Mandatory = $true)][string]$Vm,
  [string]$Usuario = 'ubuntu',
  [string]$Chave = "$env:USERPROFILE\.ssh\oracle_zap"
)
$ErrorActionPreference = 'Stop'
$site = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$tar = Join-Path $env:TEMP 'zap-bridge.tgz'
$ssh = @('-i', $Chave, '-o', 'StrictHostKeyChecking=accept-new')

tar -czf $tar -C $site `
  --exclude "bridge/node_modules" `
  --exclude "bridge/*.log" `
  --exclude "bridge/entrada*.json" `
  --exclude "bridge/respostas.json" `
  --exclude "bridge/enviados-*.json" `
  bridge config.local.json

scp @ssh $tar "${Usuario}@${Vm}:/tmp/zap-bridge.tgz"
Remove-Item $tar
ssh @ssh "${Usuario}@${Vm}" "sudo mkdir -p /opt/zap-bridge && sudo tar -xzf /tmp/zap-bridge.tgz -C /opt/zap-bridge && rm -f /tmp/zap-bridge.tgz && sudo bash /opt/zap-bridge/bridge/vm/instalar.sh"
