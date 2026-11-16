# Boas-vindas da lista de espera: manda o texto `boasvindas` para quem se
# inscreveu no site e ainda não recebeu. O incremental não é código: o `zapFila`
# já devolve só quem não está na aba `Zaps` com esta campanha.
# Agendada a cada 10 min. Não roda se a ponte (pair.js, porta 8099) estiver de pé —
# dois sockets na mesma sessão derrubam a conexão.

$ErrorActionPreference = 'Stop'
if (Get-NetTCPConnection -LocalPort 8099 -State Listen -ErrorAction SilentlyContinue) {
  Write-Output 'ponte de pe: pulando'
  exit 0
}

$env:PAINEL_SENHA = (Get-Content "$PSScriptRoot\..\config.local.json" -Raw | ConvertFrom-Json).PAINEL_SENHA
Set-Location $PSScriptRoot
node zap-sender.js send --campanha boasvindas --publico espera --limite 5 --delay-min 20 --delay-max 40 *>> "$PSScriptRoot\boasvindas.log"
