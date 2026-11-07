function Receive-PhaedraPackage {
    param([string]$Url, [string]$Destination, [long]$ExpectedSize, [scriptblock]$Progress)
    if ($ExpectedSize -le 0 -or $ExpectedSize -gt 1073741824 -or ([uri]$Url).Scheme -ne 'https') { throw 'Datos de descarga no validos.' }
    Add-Type -AssemblyName System.Net.Http
    $handler = [Net.Http.HttpClientHandler]::new()
    $handler.MaxAutomaticRedirections = 5
    $client = [Net.Http.HttpClient]::new($handler)
    $client.DefaultRequestHeaders.UserAgent.ParseAdd('Phaedra-Pro-Updater')
    $cancel = [Threading.CancellationTokenSource]::new([TimeSpan]::FromMinutes(30))
    $response = $null; $inputStream = $null; $outputStream = $null
    try {
        $request = $client.GetAsync($Url, [Net.Http.HttpCompletionOption]::ResponseHeadersRead, $cancel.Token)
        while (-not $request.IsCompleted) { & $Progress 0 $ExpectedSize; Start-Sleep -Milliseconds 50 }
        $response = $request.GetAwaiter().GetResult()
        $response.EnsureSuccessStatusCode() | Out-Null
        if ($response.RequestMessage.RequestUri.Scheme -ne 'https') { throw 'La descarga redirige a una conexion no segura.' }
        if ($response.Content.Headers.ContentLength -and $response.Content.Headers.ContentLength -ne $ExpectedSize) { throw 'El servidor anuncia otro tamano de descarga.' }
        $inputStream = $response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
        $outputStream = [IO.File]::Open($Destination, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        $buffer = New-Object byte[] 65536
        $received = 0L
        while ($true) {
            $read = $inputStream.ReadAsync($buffer, 0, $buffer.Length, $cancel.Token)
            while (-not $read.IsCompleted) { & $Progress $received $ExpectedSize; Start-Sleep -Milliseconds 50 }
            $count = $read.GetAwaiter().GetResult()
            if ($count -eq 0) { break }
            $received += $count
            if ($received -gt $ExpectedSize) { throw 'La descarga supera el tamano publicado.' }
            $outputStream.Write($buffer, 0, $count)
            & $Progress $received $ExpectedSize
        }
        if ($received -ne $ExpectedSize) { throw 'La descarga esta incompleta.' }
        $outputStream.Flush($true)
    } finally {
        $cancel.Cancel()
        if ($outputStream) { $outputStream.Dispose() }
        if ($inputStream) { $inputStream.Dispose() }
        if ($response) { $response.Dispose() }
        $client.Dispose(); $handler.Dispose(); $cancel.Dispose()
    }
}
