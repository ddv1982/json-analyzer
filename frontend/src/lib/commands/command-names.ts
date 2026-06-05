export const COMMANDS = {
  validateJson: 'validate_json',
  formatJson: 'format_json',
  analyzeJson: 'analyze_json',
  getFields: 'get_fields',
  findDuplicates: 'find_duplicates',
  minMaxFilled: 'min_max_filled',
  discoverValuesFields: 'discover_values_fields',
  analyzeValues: 'analyze_values',
  analyzeValuesExplorer: 'analyze_values_explorer',
  analyzeAdvancedFieldDuplicates: 'analyze_advanced_field_duplicates',
  analyzeCompositeDuplicates: 'analyze_composite_duplicates',
  parseCurl: 'parse_curl',
  validateCurlGuardrail: 'validate_curl_guardrail',
  executeCurl: 'execute_curl',
  startCurlJob: 'start_curl_job',
  getCurlJobResults: 'get_curl_job_results',
  cancelCurlJob: 'cancel_curl_job',
  getConfig: 'get_config',
  getHealth: 'get_health',
} as const

export const HEALTH_COMMAND = COMMANDS.getHealth
