"""
SAR Log Fetcher - Zero-Trust SSH Connection
Fetches SAR logs from remote servers without storing credentials
"""
import paramiko
import io
from typing import Dict, List, Optional
from datetime import datetime


class SARFetcher:
    """Fetch SAR logs from remote Linux servers via SSH"""
    
    def __init__(self, hostname: str, username: str, password: str = None, 
                 port: int = 22, sar_dir: str = "/var/log/sa", 
                 private_key: str = None):
        """
        Initialize SAR fetcher
        
        Args:
            hostname: Server hostname or IP
            username: SSH username
            password: SSH password (NOT stored, used only for this session)
            port: SSH port (default 22)
            sar_dir: SAR log directory (default /var/log/sa)
            private_key: SSH private key content (optional, for key-based auth)
        """
        self.hostname = hostname
        self.username = username
        self.password = password  # In-memory only, deleted after use
        self.private_key = private_key  # In-memory only, deleted after use
        self.port = port
        self.sar_dir = sar_dir
        self.client: Optional[paramiko.SSHClient] = None
    
    def connect(self) -> bool:
        """Establish SSH connection"""
        try:
            self.client = paramiko.SSHClient()
            self.client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            
            # Prepare authentication
            if self.private_key:
                # SSH Key authentication
                key = paramiko.Ed25519Key.from_private_key(io.StringIO(self.private_key))
                self.client.connect(
                    hostname=self.hostname,
                    port=self.port,
                    username=self.username,
                    pkey=key,
                    timeout=10,
                    allow_agent=False,
                    look_for_keys=False
                )
            else:
                # Password authentication
                self.client.connect(
                    hostname=self.hostname,
                    port=self.port,
                    username=self.username,
                    password=self.password,
                    timeout=10,
                    allow_agent=False,
                    look_for_keys=False
                )
            return True
        except Exception as e:
            print(f"SSH connection failed: {e}")
            return False
    
    def disconnect(self):
        """Close SSH connection and clear credentials"""
        if self.client:
            self.client.close()
            self.client = None
        
        # Clear credentials from memory
        self.password = None
        self.private_key = None
    
    def execute_command(self, command: str) -> str:
        """Execute SSH command and return output"""
        if not self.client:
            raise Exception("Not connected to SSH")
        
        stdin, stdout, stderr = self.client.exec_command(command)
        output = stdout.read().decode('utf-8')
        error = stderr.read().decode('utf-8')
        
        if error:
            raise Exception(f"Command error: {error}")
        
        return output
    
    def fetch_cpu(self, date_str: str = None) -> Dict:
        """
        Fetch CPU metrics from SAR log
        
        Returns:
            dict: {cpu_user_avg, cpu_system_avg, cpu_iowait_avg, cpu_idle_avg, cpu_peak}
        """
        if date_str is None:
            date_str = datetime.now().strftime("%d")

        # Parse date from date_str (could be "DD" or "YYYY-MM-DD")
        if len(date_str) == 2:
            # Just day, use current month/year
            year = datetime.now().strftime("%Y")
            month = datetime.now().strftime("%m")
            day = date_str
        else:
            # Full date YYYY-MM-DD
            year, month, day = date_str.split("-")

        # Custom log format: /root/log_job/20260408_daily_server-contoh.log
        # Pattern: {YYYYMMDD}_daily_{hostname}.log
        date_prefix = f"{year}{month}{day}"
        custom_log_path = f"{self.sar_dir}/{date_prefix}_daily_{self.hostname}.log"

        # Try custom format
        command = f"sudo cat {custom_log_path} 2>/dev/null"
        output = self.execute_command(command)

        # If custom format fails, try standard sysstat format
        if not output or 'No such file' in output or 'cannot open' in output.lower():
            command = f"sudo sar -u -f {self.sar_dir}/sa{date_str} 2>/dev/null || sar -u -f {self.sar_dir}/sa{date_str}"
            output = self.execute_command(command)
        
        # Parse output - Support both custom and standard format
        lines = output.strip().split('\n')
        avg_line = None

        # Check if custom format (has "USAGE CPU" header)
        is_custom_format = any('USAGE CPU' in line for line in lines)

        if is_custom_format:
            # Custom format: Parse SAR output with time entries
            # Format: HH:MM:SS AM/PM all %user %nice %system %iowait %steal %idle
            in_cpu_section = False
            cpu_values = []

            for line in lines:
                if 'USAGE CPU' in line:
                    in_cpu_section = True
                    continue
                if 'USAGE RAM' in line:
                    break
                if in_cpu_section and ('Average:' in line or ('AM' in line or 'PM' in line)) and 'all' in line:
                    # Handle both "Average:" and time-based lines
                    cpu_values.append(line)

            # If we have entries, calculate average from all time entries
            if cpu_values:
                # Sum all values
                total_user = 0
                total_system = 0
                total_iowait = 0
                total_idle = 0
                count = 0

                for line in cpu_values:
                    parts = line.split()
                    # Find 'all' position
                    try:
                        all_idx = parts.index('all')
                        # Parse: all %user %nice %system %iowait %steal %idle
                        if len(parts) > all_idx + 5:
                            total_user += float(parts[all_idx + 1])
                            total_system += float(parts[all_idx + 3])
                            total_iowait += float(parts[all_idx + 4])
                            total_idle += float(parts[all_idx + 6]) if len(parts) > all_idx + 6 else 0
                            count += 1
                    except:
                        continue

                if count > 0:
                    # Create averaged line
                    avg_user = total_user / count
                    avg_system = total_system / count
                    avg_iowait = total_iowait / count
                    avg_idle = total_idle / count
                    avg_line = f"Average: all {avg_user:.2f} 0.00 {avg_system:.2f} {avg_iowait:.2f} 0.00 {avg_idle:.2f}"
        else:
            # Standard sysstat format
            for line in lines:
                if 'Average:' in line and 'all' in line:
                    avg_line = line
                    break
        
        if not avg_line:
            return {'cpu_user_avg': 0, 'cpu_system_avg': 0, 'cpu_iowait_avg': 0, 'cpu_idle_avg': 0, 'cpu_peak': 0}
        
        # Parse: Average: all 15.23 0.00 5.67 0.12 0.00 78.98
        parts = avg_line.split()
        if len(parts) >= 7:
            cpu_user = float(parts[2])
            cpu_system = float(parts[4])
            cpu_iowait = float(parts[5])
            cpu_idle = float(parts[7]) if len(parts) > 7 else 0
            cpu_used = 100 - cpu_idle
            
            return {
                'cpu_user_avg': round(cpu_user, 2),
                'cpu_system_avg': round(cpu_system, 2),
                'cpu_iowait_avg': round(cpu_iowait, 2),
                'cpu_idle_avg': round(cpu_idle, 2),
                'cpu_peak': round(cpu_used, 2)  # Use as peak for now
            }
        
        return {'cpu_user_avg': 0, 'cpu_system_avg': 0, 'cpu_iowait_avg': 0, 'cpu_idle_avg': 0, 'cpu_peak': 0}
    
    def fetch_ram(self, date_str: str = None) -> Dict:
        """
        Fetch RAM metrics from SAR log
        
        Returns:
            dict: {ram_avg, ram_peak, kbmemfree_avg, kbcommit_avg}
        """
        if date_str is None:
            date_str = datetime.now().strftime("%d")

        # Parse date from date_str (could be "DD" or "YYYY-MM-DD")
        if len(date_str) == 2:
            year = datetime.now().strftime("%Y")
            month = datetime.now().strftime("%m")
            day = date_str
        else:
            year, month, day = date_str.split("-")

        # Custom log format: /root/log_job/20260408_daily_server-contoh.log
        date_prefix = f"{year}{month}{day}"
        custom_log_path = f"{self.sar_dir}/{date_prefix}_daily_{self.hostname}.log"

        command = f"sudo cat {custom_log_path} 2>/dev/null"
        output = self.execute_command(command)
        
        # If custom format fails, try standard sysstat format
        if not output or 'No such file' in output or 'USAGE RAM' not in output:
            command = f"sudo sar -r -f {self.sar_dir}/sa{date_str} 2>/dev/null || sar -r -f {self.sar_dir}/sa{date_str}"
            output = self.execute_command(command)
        
        lines = output.strip().split('\n')
        avg_line = None

        # Check if custom format
        is_custom_format = any('USAGE RAM' in line for line in lines)

        if is_custom_format:
            # Custom format: Parse time-based RAM entries (sorted by highest %memused first)
            in_ram_section = False
            ram_values = []

            for line in lines:
                if 'USAGE RAM' in line:
                    in_ram_section = True
                    continue
                if 'USAGE DISK' in line:
                    break
                # Skip header lines (contain "Linux" or column names)
                if in_ram_section and ('Linux' in line or 'kbmemfree' in line):
                    continue
                # Parse time-based entries with AM/PM
                if in_ram_section and ('AM' in line or 'PM' in line):
                    ram_values.append(line)

            # Calculate average and find peak from all entries
            if ram_values:
                total_kbmemfree = 0
                total_kbmemused = 0
                total_memused_pct = 0
                count = 0
                peak_memused = 0

                for line in ram_values:
                    parts = line.split()
                    try:
                        # Format: HH:MM:SS AM/PM kbmemfree kbmemused %memused kbbuffers kbcached kbcommit %commit
                        # Time is at index 0-1, data starts at index 2
                        if len(parts) >= 6:
                            kbmemfree = float(parts[2])
                            kbmemused = float(parts[3])
                            memused_pct = float(parts[4])

                            total_kbmemfree += kbmemfree
                            total_kbmemused += kbmemused
                            total_memused_pct += memused_pct
                            count += 1

                            # Track peak (highest)
                            if memused_pct > peak_memused:
                                peak_memused = memused_pct
                    except:
                        continue

                if count > 0:
                    # Calculate averages
                    avg_kbmemfree = total_kbmemfree / count
                    avg_kbmemused = total_kbmemused / count
                    avg_memused_pct = total_memused_pct / count

                    # Create averaged line for further processing
                    avg_line = f"Average: {avg_kbmemfree:.0f} 0 {avg_kbmemused:.0f} {avg_memused_pct:.2f} 0 0"
                    # Store peak separately
                    return {
                        'ram_avg': round(avg_memused_pct, 2),
                        'ram_peak': round(peak_memused, 2),
                        'kbmemfree_avg': round(avg_kbmemfree, 2),
                        'kbcommit_avg': round(avg_kbmemused, 2)
                    }
        else:
            # Standard sysstat format
            for line in lines:
                if 'Average:' in line:
                    avg_line = line
                    break
        
        if not avg_line:
            return {'ram_avg': 0, 'ram_peak': 0, 'kbmemfree_avg': 0, 'kbcommit_avg': 0}
        
        # Parse: Average: kbmemfree kbavail kbmemused %memused kbbuffers kbcached kbcommit %commit
        parts = avg_line.split()
        if len(parts) >= 5:
            kbmemfree = float(parts[1]) if parts[1].replace('.','').isdigit() else 0
            kbmemused = float(parts[3]) if parts[3].replace('.','').isdigit() else 0
            memused_pct = float(parts[4]) if parts[4].replace('.','').isdigit() else 0
            
            return {
                'ram_avg': round(memused_pct, 2),
                'ram_peak': round(memused_pct, 2),  # Use avg as peak for now
                'kbmemfree_avg': round(kbmemfree, 2),
                'kbcommit_avg': round(kbmemused, 2)
            }
        
        return {'ram_avg': 0, 'ram_peak': 0, 'kbmemfree_avg': 0, 'kbcommit_avg': 0}
    
    def fetch_disk(self) -> Dict:
        """
        Fetch disk metrics from df command or custom SAR log
        
        Returns:
            dict: {disk_root_pct, disk_data_pct}
        """
        # Try custom log format first
        year = datetime.now().strftime("%Y")
        month = datetime.now().strftime("%m")
        day = datetime.now().strftime("%d")
        
        # Custom log format: /root/log_job/20260408_daily_server-contoh.log
        date_prefix = f"{year}{month}{day}"
        custom_log_path = f"{self.sar_dir}/{date_prefix}_daily_{self.hostname}.log"

        command = f"sudo cat {custom_log_path} 2>/dev/null"
        output = self.execute_command(command)
        
        disk_root = 0
        disk_data = 0
        
        # Check if custom format with df -h output
        if output and 'USAGE DISK' in output:
            lines = output.strip().split('\n')
            in_disk_section = False
            
            for line in lines:
                if 'USAGE DISK' in line:
                    in_disk_section = True
                    continue
                if in_disk_section and 'END' in line:
                    break
                if in_disk_section and ('/' in line) and ('%' in line):
                    # Parse df -h output
                    parts = line.split()
                    if len(parts) >= 5:
                        use_pct = parts[4].replace('%', '')
                        mount_point = parts[5] if len(parts) > 5 else ''

                        try:
                            use_pct_int = int(use_pct)
                            if mount_point == '/':
                                disk_root = use_pct_int
                            elif mount_point == '/data' or mount_point == '/Backup':
                                disk_data = use_pct_int
                        except:
                            pass
        else:
            # Fallback to standard df command
            command = "df -h / /data 2>/dev/null | tail -n +2"
            output = self.execute_command(command)
            
            for line in output.strip().split('\n'):
                parts = line.split()
                if len(parts) >= 5:
                    use_pct = parts[4].replace('%', '')
                    mount_point = parts[5] if len(parts) > 5 else ''
                    
                    try:
                        use_pct_int = int(use_pct)
                        if mount_point == '/':
                            disk_root = use_pct_int
                        elif mount_point == '/data':
                            disk_data = use_pct_int
                    except:
                        pass
        
        return {'disk_root_pct': disk_root, 'disk_data_pct': disk_data}
    
    def fetch_network(self, date_str: str = None) -> Dict:
        """
        Fetch network metrics from SAR log
        
        Returns:
            dict: {net_rx_peak, net_tx_peak, net_conn}
        """
        if date_str is None:
            date_str = datetime.now().strftime("%d")
        
        # Get network interface name first
        iface_command = "ip route | grep default | awk '{print $5}' | head -1"
        try:
            iface = self.execute_command(iface_command).strip()
            if not iface:
                iface = 'eth0'
        except:
            iface = 'eth0'
        
        # Fetch network stats with sudo
        command = f"sudo sar -n DEV -f {self.sar_dir}/sa{date_str} 2>/dev/null || sar -n DEV -f {self.sar_dir}/sa{date_str}"
        output = self.execute_command(command)
        
        lines = output.strip().split('\n')
        avg_line = None
        
        for line in lines:
            if 'Average:' in line and iface in line:
                avg_line = line
                break
        
        net_rx_peak = 0
        net_tx_peak = 0
        
        if avg_line:
            # Parse: Average: eth0 150.00 100.00 512.50 256.25 ...
            parts = avg_line.split()
            if len(parts) >= 6:
                rxkbs = float(parts[4]) if parts[4].replace('.','').isdigit() else 0
                txkbs = float(parts[5]) if parts[5].replace('.','').isdigit() else 0
                
                # Convert kB/s to Mbps
                net_rx_peak = round((rxkbs * 8) / 1000, 2)  # kB/s to Mbps
                net_tx_peak = round((txkbs * 8) / 1000, 2)
        
        # Get active connections
        try:
            conn_command = "ss -tan state established | wc -l"
            conn_output = self.execute_command(conn_command)
            net_conn = int(conn_output.strip())
        except:
            net_conn = 0
        
        return {
            'net_rx_peak': net_rx_peak,
            'net_tx_peak': net_tx_peak,
            'net_conn': net_conn
        }
    
    def fetch_all(self, date_str: str = None) -> Dict:
        """
        Fetch all SAR metrics
        
        Returns:
            dict: All metrics combined
        """
        metrics = {
            'hostname': self.hostname,
            'tanggal': datetime.now().strftime('%Y-%m-%d') if date_str is None else date_str,
            'ip_address': self.hostname,
            'source': 'sar_ssh'
        }
        
        # Fetch each metric type
        cpu_metrics = self.fetch_cpu(date_str)
        ram_metrics = self.fetch_ram(date_str)
        disk_metrics = self.fetch_disk()
        network_metrics = self.fetch_network(date_str)
        
        # Merge all metrics
        metrics.update(cpu_metrics)
        metrics.update(ram_metrics)
        metrics.update(disk_metrics)
        metrics.update(network_metrics)
        
        return metrics
    
    def __enter__(self):
        """Context manager entry"""
        self.connect()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit - always disconnect and clear credentials"""
        self.disconnect()
