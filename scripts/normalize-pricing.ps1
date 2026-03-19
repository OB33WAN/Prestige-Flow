$ErrorActionPreference = 'Stop'

$files = Get-ChildItem -Recurse -File -Filter *.html
$changed = 0

foreach ($f in $files) {
  $c = Get-Content -Raw -Path $f.FullName
  $o = $c

  # Replace remaining regional SEO title phrasing
  $c = [regex]::Replace($c, 'Regional Rates', 'Service Pricing', 'IgnoreCase')

  # Replace homepage/docs FAQ regional paragraph with single schedule wording
  $c = [regex]::Replace(
    $c,
    'Our rates vary by region\. In London: Plumbing £105-115/hr \+VAT, Drainage £120-140/hr \+VAT, CCTV Surveys £175 \+VAT\. In Reading\s*&amp;\s*Slough: Plumbing £95-110/hr \+VAT, Drainage £110-130/hr \+VAT, CCTV Surveys £175 \+VAT\. Evening and weekend rates apply\. Contact us for a free, no-obligation quote for your specific requirements\.',
    'Our rates are time-based across all service areas: Plumbing £105/hr (Mon-Fri 8am-6pm), £115/hr (Mon-Fri 6pm-8am), £115/hr (Weekends). Drainage and Emergency Drainage £120/hr (Mon-Fri 8am-6pm), £140/hr (Mon-Fri 6pm-8am), £140/hr (Weekends). CCTV Surveys £175 +VAT fixed price. Contact us for a free, no-obligation quote for your specific requirements.',
    'IgnoreCase'
  )

  # Remove old regional wording
  $c = [regex]::Replace($c, 'regional rates from £110/hr', 'rates from £120/hr', 'IgnoreCase')
  $c = [regex]::Replace($c, 'London rates from £120/hr', 'rates from £120/hr', 'IgnoreCase')

  # Normalize mixed SEO snippets
  $c = [regex]::Replace($c, 'Emergency drain unblocking from £110/hr, plumbing from £95/hr, CCTV £175', 'Emergency drain unblocking from £120/hr, plumbing from £105/hr, CCTV £175', 'IgnoreCase')
  $c = [regex]::Replace($c, 'From £95/hr\.', 'From £105/hr.', 'IgnoreCase')
  $c = [regex]::Replace($c, 'From £95/hr\s*\|', 'From £105/hr |', 'IgnoreCase')

  # Drainage/Emergency old schedule -> new schedule
  $c = [regex]::Replace($c, 'From £110/hr \+\s*VAT', 'From £120/hr + VAT', 'IgnoreCase')
  $c = [regex]::Replace($c, 'From £110/hr \+VAT', 'From £120/hr +VAT', 'IgnoreCase')
  $c = [regex]::Replace($c, '>From £110/hr<', '>From £120/hr<', 'IgnoreCase')
  $c = [regex]::Replace($c, '£130/hr', '£140/hr', 'IgnoreCase')
  $c = [regex]::Replace($c, '£110/hour \+\s*VAT \(8am-6pm weekdays\)', '£120/hour + VAT (8am-6pm weekdays)', 'IgnoreCase')
  $c = [regex]::Replace($c, '£130/hour \+\s*VAT', '£140/hour + VAT', 'IgnoreCase')

  # Plumbing old schedule -> new schedule
  $c = [regex]::Replace($c, 'From £95/hr \+\s*VAT', 'From £105/hr + VAT', 'IgnoreCase')
  $c = [regex]::Replace($c, 'From £95/hr \+VAT', 'From £105/hr +VAT', 'IgnoreCase')
  $c = [regex]::Replace($c, '>From £95/hr<', '>From £105/hr<', 'IgnoreCase')
  $c = [regex]::Replace($c, '£95/hour \+\s*VAT', '£105/hour + VAT', 'IgnoreCase')

  # Remaining old plumbing out-of-hours phrasing
  $c = [regex]::Replace($c, 'From £105/hr \+VAT \(weekdays\) \| £110/hr \+VAT \(evenings/weekends\)', 'From £105/hr +VAT (weekdays) | £115/hr +VAT (evenings/weekends)', 'IgnoreCase')
  $c = [regex]::Replace($c, 'From £105/hr \+ VAT \(weekdays\) \| £110/hr \+VAT \(evenings/weekends\)', 'From £105/hr +VAT (weekdays) | £115/hr +VAT (evenings/weekends)', 'IgnoreCase')
  $c = [regex]::Replace($c, 'Evenings/Weekends: £110/hr \+VAT', 'Evenings/Weekends: £115/hr +VAT', 'IgnoreCase')
  $c = [regex]::Replace($c, 'Mon-Fri 8am-6pm\. Evenings/Weekends: £110/hr \+VAT', 'Mon-Fri 8am-6pm. Evenings/Weekends: £115/hr +VAT', 'IgnoreCase')
  $c = [regex]::Replace($c, 'from £105/hour \+ VAT \(8am-6pm weekdays\), from £110/hour \+ VAT', 'from £105/hour + VAT (8am-6pm weekdays), from £115/hour + VAT', 'IgnoreCase')

  # Normalize area-page schedule bullets to exact format
  $c = [regex]::Replace($c, 'Plumbing: From £105/hr \+ VAT \(weekdays\) \| £110/hr \+VAT \(evenings/weekends\)', 'Plumbing: £105/hr +VAT (Mon-Fri 8am-6pm) | £115/hr +VAT (Mon-Fri 6pm-8am) | £115/hr +VAT (Weekends)', 'IgnoreCase')
  $c = [regex]::Replace($c, 'Drainage: From £120/hr \+ VAT \(weekdays\) \| £140/hr \+VAT \(evenings/weekends\)', 'Drainage &amp; Emergency Drainage: £120/hr +VAT (Mon-Fri 8am-6pm) | £140/hr +VAT (Mon-Fri 6pm-8am) | £140/hr +VAT (Weekends)', 'IgnoreCase')

  # Service-page regional split bullets -> unified all-areas line
  $c = [regex]::Replace($c, '<li>London: From £120/hr \+VAT \(weekdays\) \| £140/hr \+VAT \(evenings/weekends\)</li>', '<li>All areas: From £120/hr +VAT (weekdays) | £140/hr +VAT (evenings/weekends)</li>', 'IgnoreCase')
  $c = [regex]::Replace($c, '<li>Reading\s*&amp;\s*Slough:\s*From £120/hr \+VAT \(weekdays\) \| £140/hr \+VAT \(evenings/weekends\)</li>', '', 'IgnoreCase')
  $c = [regex]::Replace($c, '<li>Reading\s*&amp;\s*Slough:\s*From £110/hr \+VAT \(weekdays\) \| £130/hr \+VAT \(evenings/weekends\)</li>', '', 'IgnoreCase')
  $c = [regex]::Replace($c, '<li>Reading\s*&amp;\s*Slough:\s*From £95/hr \+VAT \(weekdays\) \| £110/hr \+VAT \(evenings/weekends\)</li>', '', 'IgnoreCase')

  # Apply exact target wording in service pages and indexes
  $c = [regex]::Replace($c, 'All areas: From £120/hr \+VAT \(weekdays\) \| £140/hr \+VAT \(evenings/weekends\)', 'All areas: £120/hr +VAT (Mon-Fri 8am-6pm) | £140/hr +VAT (Mon-Fri 6pm-8am) | £140/hr +VAT (Weekends)', 'IgnoreCase')
  $c = [regex]::Replace($c, 'All areas: From £105/hr \+ VAT \(weekdays\) \| £110/hr \+VAT \(evenings/weekends\)', 'All areas: £105/hr +VAT (Mon-Fri 8am-6pm) | £115/hr +VAT (Mon-Fri 6pm-8am) | £115/hr +VAT (Weekends)', 'IgnoreCase')
  $c = [regex]::Replace($c, 'Reading\s*&amp;\s*Slough:\s*From £120/hr \+ VAT \(weekdays\) \| £140/hr \+VAT \(evenings/weekends\)', 'All areas: £120/hr +VAT (Mon-Fri 8am-6pm) | £140/hr +VAT (Mon-Fri 6pm-8am) | £140/hr +VAT (Weekends)', 'IgnoreCase')
  $c = [regex]::Replace($c, 'Reading\s*&amp;\s*Slough:\s*From £105/hr \+ VAT \(weekdays\) \| £110/hr \+VAT \(evenings/weekends\)', 'All areas: £105/hr +VAT (Mon-Fri 8am-6pm) | £115/hr +VAT (Mon-Fri 6pm-8am) | £115/hr +VAT (Weekends)', 'IgnoreCase')
  $c = [regex]::Replace($c, 'Reading\s*&amp;\s*Slough:\s*£175 \+VAT \(fixed price\)', 'All areas: £175 +VAT (fixed price)', 'IgnoreCase')

  # Regional language cleanup in area index pages
  $c = [regex]::Replace($c, 'competitive regional rates', 'same time-based pricing as all areas', 'IgnoreCase')

  if ($c -ne $o) {
    Set-Content -Path $f.FullName -Value $c -NoNewline
    $changed++
  }
}

Write-Host "Files changed:" $changed
