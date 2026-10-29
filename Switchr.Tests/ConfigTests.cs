using YamlDotNet.Serialization;
using YamlDotNet.Serialization.NamingConventions;
using Switchr.Models;
using Xunit;

namespace Switchr.Tests;

public class ConfigTests
{
    [Fact]
    public void YamlDeserialization_ValidConfig_ParsesProperly()
    {
        var yaml = """
        app:
          name: "Switchr"
          version: "1.0.0"
          dry_run: true
          default_job_timeout: 120
          log_dir: "test_logs"

        hosts:
          - id: "test-win"
            name: "Test Windows Host"
            os_type: "windows"
            hostname: "10.0.0.1"
            port: 5985
            auth:
              type: "password"
              username: "admin"
              password: "pwd"
            description: "Test description"

        services:
          - id: "svc1"
            host_id: "test-win"
            name: "Service1"
            service_type: "windows_service"
            verification_service_name: "Service1"
            current_profile: "profA"
            description: "Service description"
            profiles:
              - name: "profA"
                description: "Profile A"
                script_path: "C:\\script.bat"
                parameters: ["--mode", "A"]
                timeout_seconds: 60
        """;

        var deserializer = new DeserializerBuilder()
            .WithNamingConvention(UnderscoredNamingConvention.Instance)
            .IgnoreUnmatchedProperties()
            .Build();

        var config = deserializer.Deserialize<SwitchrConfig>(yaml);

        Assert.NotNull(config);
        Assert.True(config.App.DryRun);
        Assert.Equal(120, config.App.DefaultJobTimeout);
        Assert.Equal("test_logs", config.App.LogDir);

        Assert.Single(config.Hosts);
        var host = config.Hosts[0];
        Assert.Equal("test-win", host.Id);
        Assert.Equal("10.0.0.1", host.Hostname);
        Assert.Equal("windows", host.OsType);
        Assert.Equal("admin", host.EffectiveUsername);
        Assert.Equal("pwd", host.EffectivePassword);

        Assert.Single(config.Services);
        var svc = config.Services[0];
        Assert.Equal("svc1", svc.Id);
        Assert.Equal("Service1", svc.Name);
        Assert.Equal("profA", svc.CurrentProfile);

        Assert.Single(svc.Profiles);
        var profile = svc.Profiles[0];
        Assert.Equal("profA", profile.Name);
        Assert.Equal("C:\\script.bat", profile.ScriptPath);
        Assert.Equal(2, profile.Parameters.Count);
        Assert.Equal("--mode A", profile.ArgumentsString);

        // Fallback backward compatibility verification
        var effectiveScripts = profile.GetEffectiveScripts();
        Assert.Single(effectiveScripts);
        Assert.Equal("C:\\script.bat", effectiveScripts[0].ScriptPath);
        Assert.Equal("--mode A", effectiveScripts[0].ArgumentsString);
    }

    [Fact]
    public void YamlDeserialization_MultiScriptConfig_ParsesProperly()
    {
        var yaml = """
        app:
          name: "Switchr"
          version: "1.0.0"

        hosts:
          - id: "win-01"
            name: "Host 1"
            os_type: "windows"
            hostname: "192.168.1.10"

        services:
          - id: "svc-fin"
            host_id: "win-01"
            name: "Financial Service"
            verification_service_name: "FinSvc"
            current_profile: "prod-high"
            profiles:
              - name: "prod-high"
                description: "Production High Profile"
                scripts:
                  - name: "Stop service"
                    script_path: "C:\\scripts\\stop.bat"
                    parameters: ["--force"]
                    timeout_seconds: 45
                  - name: "Copy configuration"
                    script_path: "C:\\scripts\\copy_config.bat"
                    parameters: ["--env", "prod"]
                    timeout_seconds: 90
                  - name: "Start service"
                    script_path: "C:\\scripts\\start.bat"
                    timeout_seconds: 60
        """;

        var deserializer = new DeserializerBuilder()
            .WithNamingConvention(UnderscoredNamingConvention.Instance)
            .IgnoreUnmatchedProperties()
            .Build();

        var config = deserializer.Deserialize<SwitchrConfig>(yaml);

        Assert.NotNull(config);
        var svc = Assert.Single(config.Services);
        var profile = Assert.Single(svc.Profiles);
        Assert.Equal("prod-high", profile.Name);
        Assert.Equal(3, profile.Scripts.Count);

        var step1 = profile.Scripts[0];
        Assert.Equal("Stop service", step1.Name);
        Assert.Equal("C:\\scripts\\stop.bat", step1.ScriptPath);
        Assert.Equal("--force", step1.ArgumentsString);
        Assert.Equal(45, step1.TimeoutSeconds);

        var step2 = profile.Scripts[1];
        Assert.Equal("Copy configuration", step2.Name);
        Assert.Equal("--env prod", step2.ArgumentsString);

        var step3 = profile.Scripts[2];
        Assert.Equal("Start service", step3.Name);
        Assert.Empty(step3.Parameters);
        Assert.Equal(60, step3.TimeoutSeconds);

        var effectiveScripts = profile.GetEffectiveScripts();
        Assert.Equal(3, effectiveScripts.Count);
    }
}
