"""SSH Handler for Backup Check Module"""
import paramiko
import shlex
import time
import os
import logging
from typing import Optional, Tuple

logger = logging.getLogger("ssh_handler")

SSH_KEY_PATH = os.getenv("SSH_KEY_PATH", os.path.expanduser("~/.ssh/id_rsa"))
MAX_RETRIES = 3
RETRY_DELAYS = [5, 15, 30]


class SSHConnection:
    """Handle SSH connections to QNAP NAS"""

    def __init__(self, host: str, username: str, password: str = None, port: int = 22, private_key: str = None):
        self.host = host
        self.username = username
        self.password = password
        self.private_key = private_key
        self.port = port
        self.ssh: Optional[paramiko.SSHClient] = None

    def connect(self, retry_delays=None) -> Tuple[bool, str]:
        """
        Connect to SSH server with retry logic and exponential backoff
        Args:
            retry_delays: custom retry delays in seconds (default: [5, 15, 30])
        Returns: (success, message)
        """
        delays = retry_delays or RETRY_DELAYS
        last_error = ""
        for attempt in range(MAX_RETRIES):
            try:
                if attempt > 0:
                    delay = delays[attempt - 1] if attempt - 1 < len(delays) else delays[-1]
                    logger.info("[SSH] %s retry attempt %d/%d in %ds...", self.host, attempt + 1, MAX_RETRIES, delay)
                    time.sleep(delay)

                logger.debug("[SSH] Connecting to %s:%s (attempt %d/%d)...", self.host, self.port, attempt + 1, MAX_RETRIES)
                self.ssh = paramiko.SSHClient()
                logger.warning("[SSH] Unknown host key for %s:%s — connection allowed (WarningPolicy)", self.host, self.port)
                self.ssh.set_missing_host_key_policy(paramiko.WarningPolicy())

                start_time = time.time()

                if self.private_key:
                    import io
                    key = paramiko.Ed25519Key.from_private_key(io.StringIO(self.private_key))
                    self.ssh.connect(
                        hostname=self.host,
                        username=self.username,
                        pkey=key,
                        port=self.port,
                        timeout=30,
                        auth_timeout=30,
                        banner_timeout=30,
                    )
                else:
                    self.ssh.connect(
                        hostname=self.host,
                        username=self.username,
                        password=self.password or None,
                        port=self.port,
                        key_filename=os.path.expanduser(SSH_KEY_PATH) if not self.password else None,
                        timeout=30,
                        auth_timeout=30,
                        banner_timeout=30,
                        allow_agent=False,
                        look_for_keys=False,
                    )

                elapsed = time.time() - start_time
                logger.info("[SSH] Connected to %s in %.2fs", self.host, elapsed)
                return True, f"Connected to {self.host} in {elapsed:.1f}s"

            except paramiko.AuthenticationException:
                logger.error("[SSH] %s authentication failed (attempt %d/%d)", self.host, attempt + 1, MAX_RETRIES)
                last_error = "Authentication failed. Please check your credentials."
                if self.ssh:
                    try:
                        self.ssh.close()
                    except Exception:
                        pass
                    self.ssh = None
            except paramiko.SSHException as e:
                logger.error("[SSH] %s SSH error (attempt %d/%d): %s (%s)", self.host, attempt + 1, MAX_RETRIES, type(e).__name__, str(e))
                last_error = f"SSH error: {str(e)}"
                self.ssh = None
            except Exception as e:
                logger.error("[SSH] %s connection error (attempt %d/%d): %s (%s)", self.host, attempt + 1, MAX_RETRIES, type(e).__name__, str(e))
                last_error = f"Connection error: {str(e)}"
                self.ssh = None

        logger.error("[SSH] %s all %d attempts failed", self.host, MAX_RETRIES)
        return False, last_error
    
    def disconnect(self):
        """Close SSH connection"""
        if self.ssh:
            try:
                self.ssh.close()
            except Exception:
                pass
            self.ssh = None

    def execute(self, command: str, use_sudo: bool = False, sudo_password: str = None, use_shell: bool = True) -> Tuple[str, str]:
        """
        Execute command via SSH with optional sudo password handling.
        Uses stdin for password (sudo -S) for reliable non-interactive execution.

        Args:
            command: The command to execute
            use_sudo: If True, prefix command with 'sudo -S ' (stdin password)
            sudo_password: Sudo password (if not provided, uses self.password)
            use_shell: If True, wrap command in bash -c for proper shell expansion

        Returns: (stdout, stderr)
        """
        if not self.ssh:
            return "", "Not connected"

        # Prepare command
        cmd = command
        password_to_use = sudo_password or self.password

        if use_sudo and password_to_use:
            # Use stdin for password to avoid shell injection via single quotes
            if use_shell:
                cmd = f"bash -c {shlex.quote(command)}"
            stdin, stdout, stderr = self.ssh.exec_command(f"sudo -S {cmd}", timeout=120)
            stdin.write(password_to_use + '\n')
            stdin.flush()
            out = stdout.read().decode('utf-8')
            err = stderr.read().decode('utf-8')
            if err:
                logger.warning(f"stderr: {err[:200]}")
            return out, err

        if use_shell:
            cmd = f"bash -c {shlex.quote(cmd)}"

        logger.debug("[SSH] %s executing: %s", self.host, cmd[:100])

        try:
            stdin, stdout, stderr = self.ssh.exec_command(cmd, timeout=120)
            out = stdout.read().decode('utf-8')
            err = stderr.read().decode('utf-8')

            if err:
                logger.warning("[SSH] %s stderr: %s", self.host, err[:200])

            return out, err
        except Exception as e:
            logger.error("[SSH] %s command execution error: %s (%s)", self.host, type(e).__name__, str(e))
            return "", str(e)

    def list_log_files(self, path: str) -> Tuple[bool, list, str]:
        """
        List ALL .log files using ls (compatible with all systems)
        Returns: (success, file_list_with_size, message)
        """
        if not self.ssh:
            return False, [], "Not connected"

        try:
            cmd = f"ls -1 {shlex.quote(path)}/*.log 2>/dev/null"
            stdin, stdout, stderr = self.ssh.exec_command(cmd, timeout=30)
            error = stderr.read().decode().strip()

            if "No such file" in error or "cannot access" in error:
                logger.warning("[SSH] %s no .log files found in %s", self.host, path)
                return False, [], f"No .log files found in {path}"

            if error:
                return False, [], f"Error listing files: {error}"

            files = []
            for line in stdout.read().decode().splitlines():
                filename = line.strip()
                if filename:
                    files.append(filename)

            logger.info("[SSH] %s found %d .log files", self.host, len(files))

            files_with_size = [(f, 0) for f in files]

            return True, files_with_size, f"Found {len(files)} log files"
        except Exception as e:
            logger.error("[SSH] %s list_log_files exception: %s (%s)", self.host, type(e).__name__, str(e))
            return False, [], f"Error: {str(e)}"
    
    def read_file(self, filepath: str, max_lines: int = 1000) -> Tuple[bool, str, str]:
        """
        Read content of a file using grep to extract only needed lines
        This is FAST even for huge files (10000+ lines)
        Returns: (success, content, message)
        """
        if not self.ssh:
            return False, "", "Not connected"
        
        try:
            # Use grep to extract only lines with "Jumlah" or "Total Size"
            # Much faster than reading entire file!
            cmd = f"grep -E 'Jumlah\\s*Files|Total\\s*Size.*Bytes' {shlex.quote(filepath)} 2>/dev/null"
            stdin, stdout, stderr = self.ssh.exec_command(cmd, timeout=10)
            error = stderr.read().decode().strip()
            
            if error and "No such file" not in error:
                return False, "", f"Error reading file: {error}"
            
            content = stdout.read().decode(errors="ignore")
            
            # If grep found nothing, file might be empty or malformed
            if not content.strip():
                # Fallback: read first 100 lines
                cmd = f"head -n 100 {shlex.quote(filepath)}"
                stdin, stdout, stderr = self.ssh.exec_command(cmd, timeout=10)
                content = stdout.read().decode(errors="ignore")
            
            return True, content, f"Extracted key lines"
        except Exception as e:
            return False, "", f"Error: {str(e)}"
    
    def read_file_full(self, filepath: str, max_lines: int = 5000) -> Tuple[bool, str, str]:
        """
        Read the log region that holds the backed-up file list, used to extract
        it. The "Daftar file:" / "FILES BACKED UP" summary can sit anywhere in a
        long log (verbose output above it), so a plain `head` of the top may miss
        it. We extract from the first file-list marker to EOF (capped to
        max_lines), and fall back to `head -n max_lines` when no marker is found.
        Does not replace read_file (summary extraction). Portable awk (no gawk
        extensions). Returns: (success, content, message)
        """
        if not self.ssh:
            return False, "", "Not connected"

        try:
            qf = shlex.quote(filepath)
            awk_prog = (
                "!f && (/[Dd]aftar.*[Ff]ile/ || /FILES BACKED UP/){f=1} "
                "f{print; n++; if(n>=%d) exit}" % int(max_lines)
            )
            cmd = "awk '%s' %s 2>/dev/null" % (awk_prog, qf)
            stdin, stdout, stderr = self.ssh.exec_command(cmd, timeout=15)
            error = stderr.read().decode().strip()
            content = stdout.read().decode(errors="ignore")

            # Fallback to top-of-file if marker extraction yielded nothing
            # (e.g. awk unavailable, or an unexpected layout).
            if not content.strip():
                cmd = f"head -n {int(max_lines)} {qf} 2>/dev/null"
                stdin, stdout, stderr = self.ssh.exec_command(cmd, timeout=15)
                err2 = stderr.read().decode().strip()
                error = err2 or error
                content = stdout.read().decode(errors="ignore")

            if error and "No such file" not in error:
                return False, "", f"Error reading file: {error}"

            return True, content, "Read file content"
        except Exception as e:
            return False, "", f"Error: {str(e)}"

    def is_connected(self) -> bool:
        """Check if SSH connection is active"""
        return self.ssh is not None
